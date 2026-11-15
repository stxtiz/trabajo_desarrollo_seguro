import { Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from './context/AppContext.jsx';
import CartaPage from './pages/CartaPage.jsx';
import CarritoPage from './pages/CarritoPage.jsx';
import AdminPage from './pages/AdminPage.jsx';

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/carta" element={<CartaPage />} />
        <Route path="/c/:ref" element={<CartaPage />} />
        <Route path="/carrito" element={<CarritoPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/carta" replace />} />
      </Routes>
    </AppProvider>
  );
}
