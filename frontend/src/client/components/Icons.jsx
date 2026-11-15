import { useEffect, useState } from 'react';

export function IconoReloj() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
      className="bi bi-alarm"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        d="M6.5 0a.5.5 0 0 0 0 1H7v1.07a7.001 7.001 0 0 0-3.273 12.474l-.602.602a.5.5 0 0 0 .707.708l.746-.746A6.97 6.97 0 0 0 8 16a6.97 6.97 0 0 0 3.422-.892l.746.746a.5.5 0 0 0 .707-.708l-.601-.602A7.001 7.001 0 0 0 9 2.07V1h.5a.5.5 0 0 0 0-1h-3zm1.038 3.018a6.093 6.093 0 0 1 .924 0 6 6 0 1 1-.924 0zM8.5 5.5a.5.5 0 0 0-1 0v3.362l-1.429 2.38a.5.5 0 1 0 .858.515l1.5-2.5A.5.5 0 0 0 8.5 9V5.5zM0 3.5c0 .753.333 1.429.86 1.887A8.035 8.035 0 0 1 4.387 1.86 2.5 2.5 0 0 0 0 3.5zM13.5 1c-.753 0-1.429.333-1.887.86a8.035 8.035 0 0 1 3.527 3.527A2.5 2.5 0 0 0 13.5 1z"
      />
    </svg>
  );
}

export function IconoTelefono() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
      className="bi bi-telephone-fill"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        d="M2.267.98a1.636 1.636 0 0 1 2.448.152l1.681 2.162c.309.396.418.913.296 1.4l-.513 2.053a.636.636 0 0 0 .167.604L8.65 9.654a.636.636 0 0 0 .604.167l2.052-.513a1.636 1.636 0 0 1 1.401.296l2.162 1.681c.777.604.849 1.753.153 2.448l-.97.97c-.693.693-1.73.998-2.697.658a17.47 17.47 0 0 1-6.571-4.144A17.47 17.47 0 0 1 .639 4.646c-.34-.967-.035-2.004.658-2.698l.97-.969z"
      />
    </svg>
  );
}

export function IconoEmail() {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
      className="bi bi-envelope-fill"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        d="M.05 3.555A2 2 0 0 1 2 2h12a2 2 0 0 1 1.95 1.555L8 8.414.05 3.555zM0 4.697v7.104l5.803-3.558L0 4.697zM6.761 8.83l-6.57 4.027A2 2 0 0 0 2 14h12a2 2 0 0 0 1.808-1.144l-6.57-4.027L8 9.586l-1.239-.757zm3.436-.586L16 11.801V4.697l-5.803 3.546z"
      />
    </svg>
  );
}

export function IconoBasurero() {
  return (
    <svg
      width="2em"
      height="2em"
      viewBox="0 0 16 16"
      className="bi bi-trash-fill text-danger"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        d="M2.5 1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1H3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4h.5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1H2.5zm3 4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5zM8 5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7A.5.5 0 0 1 8 5zm3 .5a.5.5 0 0 0-1 0v7a.5.5 0 0 0 1 0v-7z"
      />
    </svg>
  );
}

export function RatingStars({ puntuacion }) {
  const total = Math.max(0, Math.min(5, Number.parseInt(puntuacion, 10) || 0));
  return (
    <ul className="rating-star">
      {Array.from({ length: total }, (_, idx) => (
        <li key={idx}>
          <i className="ti-star" />
        </li>
      ))}
    </ul>
  );
}

export function SafeImage({
  fotoUrl,
  alt,
  fallbackSrc = '/img/carta_comodin.png',
  fallbackAlt = '',
  ...rest
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [fotoUrl]);

  const resolvedFotoUrl =
    typeof fotoUrl === 'string' && fotoUrl.length > 0
      ? fotoUrl.startsWith('data:image/') || fotoUrl.startsWith('/')
        ? fotoUrl
        : `/${fotoUrl}`
      : null;

  const src = !failed && resolvedFotoUrl ? resolvedFotoUrl : fallbackSrc;
  const effectiveAlt = !failed && resolvedFotoUrl ? alt || fallbackAlt : fallbackAlt;

  return (
    <img
      {...rest}
      src={src}
      alt={effectiveAlt}
      onError={() => {
        if (!failed) {
          setFailed(true);
        }
      }}
    />
  );
}
