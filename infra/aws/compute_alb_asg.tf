# =============================================================================
# CÓMPUTO EC2 UBUNTU 24.04, ELASTIC IP, APPLICATION LOAD BALANCER Y AUTO SCALING
# Proyecto: Carta Digital PNK Security (OWASP ASVS v5.0 Nivel 3)
# =============================================================================

# Lookup automático de la AMI oficial más reciente de Ubuntu 24.04 LTS (Noble) amd64
data "aws_ami" "ubuntu_2404" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

locals {
  rendered_user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    git_repo_url    = var.git_repo_url
    git_branch      = var.git_branch
    rds_address     = aws_db_instance.postgres.address
    db_name         = var.db_name
    db_username     = var.db_username
    db_password     = random_password.db_password.result
    password_pepper = random_password.password_pepper.result
    cors_origin     = var.cors_origin
  })
}

# --- Instancia EC2 Primaria (con Elastic IP fija para SSH / CI-CD / sslip.io) ---
resource "aws_instance" "primary" {
  ami                         = data.aws_ami.ubuntu_2404.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public[0].id
  vpc_security_group_ids      = [aws_security_group.ec2_sg.id]
  key_name                    = aws_key_pair.deploy_key.key_name
  associate_public_ip_address = true
  user_data                   = local.rendered_user_data
  user_data_replace_on_change = true

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required" # IMDSv2 obligatorio (ASVS v5.0)
  }

  root_block_device {
    volume_size = var.root_volume_size
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "${var.project_name}-primary-ec2"
    Role = "primary"
  }

  depends_on = [aws_db_instance.postgres]
}

resource "aws_eip" "primary" {
  domain = "vpc"

  tags = {
    Name = "${var.project_name}-primary-eip"
  }
}

resource "aws_eip_association" "primary" {
  instance_id   = aws_instance.primary.id
  allocation_id = aws_eip.primary.id
}

# --- Application Load Balancer (ALB), Target Group (/health) y Listener HTTP 80 ---
resource "aws_lb" "main" {
  name                       = "${var.project_name}-alb"
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb_sg.id]
  subnets                    = aws_subnet.public[*].id
  enable_deletion_protection = false

  tags = {
    Name = "${var.project_name}-alb"
  }
}

resource "aws_lb_target_group" "frontend" {
  name     = "${var.project_name}-tg"
  port     = 80
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    enabled             = true
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = {
    Name = "${var.project_name}-tg"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

resource "aws_lb_target_group_attachment" "primary" {
  target_group_arn = aws_lb_target_group.frontend.arn
  target_id        = aws_instance.primary.id
  port             = 80
}

# --- Launch Template + Auto Scaling Group (ASG) + Política CPU Target Tracking ---
resource "aws_launch_template" "app" {
  name_prefix   = "${var.project_name}-lt-"
  image_id      = data.aws_ami.ubuntu_2404.id
  instance_type = var.instance_type
  key_name      = aws_key_pair.deploy_key.key_name
  user_data     = base64encode(local.rendered_user_data)

  network_interfaces {
    associate_public_ip_address = true
    security_groups             = [aws_security_group.ec2_sg.id]
  }

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required" # IMDSv2 obligatorio (ASVS v5.0)
  }

  block_device_mappings {
    device_name = "/dev/sda1"

    ebs {
      volume_size           = var.root_volume_size
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name        = "${var.project_name}-asg-ec2"
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
      Role        = "autoscaling"
    }
  }
}

resource "aws_autoscaling_group" "app" {
  name                      = "${var.project_name}-asg"
  vpc_zone_identifier       = aws_subnet.public[*].id
  target_group_arns         = [aws_lb_target_group.frontend.arn]
  health_check_type         = "ELB"
  health_check_grace_period = 420
  min_size                  = var.asg_min_size
  desired_capacity          = var.asg_desired_capacity
  max_size                  = var.asg_max_size

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "${var.project_name}-asg-node"
    propagate_at_launch = true
  }

  depends_on = [
    aws_instance.primary,
    aws_db_instance.postgres
  ]
}

resource "aws_autoscaling_policy" "cpu_target_tracking" {
  name                   = "${var.project_name}-cpu-target-70"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 70.0
  }
}
