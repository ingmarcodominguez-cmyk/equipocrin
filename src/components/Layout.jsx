import { useState, useEffect, useRef } from 'react'
import AgendaMensualPro from './AgendaMensualPro.jsx'
import AgendaFija from './AgendaFija.jsx'
import Tasks from './Tasks.jsx'
import Dashboard from './Dashboard.jsx'

function Layout({ userData, logout }) {
  const [vista, setVista] = useState(localStorage.getItem('vista') || 'dashboard')
  const [menuVisible, setMenuVisible] = useState(window.innerWidth > 768) // Oculto en móvil por defecto
  
  const audioRef = useRef(new Audio('/notificacion.mp3'));

  useEffect(() => {
    localStorage.setItem('vista', vista)
  }, [vista])

  const playNotification = () => {
    audioRef.current.play().catch(e => console.log("Interacción necesaria"));
  };

  if (!userData) return <div>Cargando...</div>

  const rol = userData?.rol?.toLowerCase();
  const esAdministrativo = rol === 'administracion' || rol === 'direccion';

  // Función para cerrar el menú al hacer clic en una opción (solo en móvil)
  const cambiarVista = (nuevaVista) => {
    setVista(nuevaVista);
    if (window.innerWidth <= 768) setMenuVisible(false);
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative' }} onClick={playNotification}>
      
      {/* MENÚ LATERAL */}
      {menuVisible && (
        <div style={{ 
          width: 250, 
          backgroundColor: '#0f172a', 
          color: 'white', 
          padding: 20,
          position: window.innerWidth <= 768 ? 'absolute' : 'relative',
          height: '100vh',
          zIndex: 1000,
          boxShadow: window.innerWidth <= 768 ? '5px 0 15px rgba(0,0,0,0.3)' : 'none'
        }}>
          <button onClick={() => setMenuVisible(false)} style={{ marginBottom: 20, background: 'none', border: '1px solid white', color: 'white', cursor: 'pointer' }}>
            ✕ Cerrar Menú
          </button>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <button style={btnStyle} onClick={() => cambiarVista('dashboard')}>🏠 Menú Principal</button>
            {esAdministrativo && <button style={btnStyle} onClick={() => cambiarVista('agenda')}>📅 Agenda Mensual</button>}
            <button style={btnStyle} onClick={() => cambiarVista('tareas')}>✅ Tareas</button>
            <button style={btnStyle} onClick={() => cambiarVista('profesionales')}>⚙️ Agenda Fija</button>
          </div>
          
          <div style={{ marginTop: 40 }}>
            <button onClick={logout} style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', width: '100%' }}>Cerrar sesión</button>
          </div>
        </div>
      )}

      {/* ÁREA DERECHA */}
      <div style={{ flex: 1, overflowX: 'hidden' }}>
        {/* Botón hamburguesa (solo si menú está oculto) */}
        {!menuVisible && (
          <button onClick={() => setMenuVisible(true)} style={{ margin: 15, padding: '10px 20px', cursor: 'pointer' }}>
            ≡ Menú
          </button>
        )}

        <div style={{ padding: '20px' }}>
          {vista === 'dashboard' && <Dashboard userData={userData} setVista={setVista} />}
          {vista === 'agenda' && esAdministrativo && <AgendaMensualPro userData={userData} />}
          {vista === 'tareas' && <Tasks userData={userData} playNotification={playNotification} />}
          {vista === 'profesionales' && <AgendaFija userData={userData} />}
        </div>
      </div>
    </div>
  )
}

const btnStyle = { 
  background: 'none', 
  border: 'none', 
  color: 'white', 
  textAlign: 'left', 
  fontSize: '1.1rem', 
  cursor: 'pointer', 
  display: 'flex', 
  alignItems: 'center', 
  gap: '10px' 
}

export default Layout