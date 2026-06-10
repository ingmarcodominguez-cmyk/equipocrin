import { useState, useEffect, useRef } from 'react'
import AgendaMensualPro from './AgendaMensualPro.jsx'
import AgendaFija from './AgendaFija.jsx'
import Tasks from './Tasks.jsx'
import Dashboard from './Dashboard.jsx'

function Layout({ userData, logout }) {
  const [vista, setVista] = useState(localStorage.getItem('vista') || 'dashboard')
  const [menuVisible, setMenuVisible] = useState(window.innerWidth > 768)
  
  const audioRef = useRef(new Audio('/notificacion.mp3'));

  useEffect(() => {
    localStorage.setItem('vista', vista)
  }, [vista])

  const playNotification = () => {
    audioRef.current.play().catch(e => console.log("Interacción necesaria"));
  };

  if (!userData) return <div style={{ padding: 20 }}>Cargando datos de usuario...</div>

  const rol = userData?.rol?.toLowerCase();
  const esAdministrativo = rol === 'administracion' || rol === 'direccion';

  const cambiarVista = (nuevaVista) => {
    setVista(nuevaVista);
    // Si estamos en móvil, ocultamos el menú automáticamente al seleccionar una opción
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
          {/* Botón para ocultar menú (solo oculta, no navega) */}
          <button 
            onClick={() => setMenuVisible(false)} 
            style={{ marginBottom: 20, background: '#1e293b', border: 'none', color: '#cbd5e1', padding: '10px', width: '100%', cursor: 'pointer', borderRadius: '4px' }}
          >
            ← Ocultar Menú
          </button>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <button style={btnStyle} onClick={() => cambiarVista('dashboard')}>🏠 Menú Principal</button>
            {esAdministrativo && <button style={btnStyle} onClick={() => cambiarVista('agenda')}>📅 Agenda Mensual</button>}
            <button style={btnStyle} onClick={() => cambiarVista('tareas')}>✅ Tareas</button>
            <button style={btnStyle} onClick={() => cambiarVista('profesionales')}>⚙️ Agenda Fija</button>
          </div>
          
          <div style={{ marginTop: 40 }}>
            <button onClick={logout} style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '10px', borderRadius: '4px', cursor: 'pointer', width: '100%' }}>
              Cerrar sesión
            </button>
          </div>
        </div>
      )}

      {/* ÁREA DE CONTENIDO */}
      <div style={{ flex: 1, overflowX: 'hidden' }}>
        {/* Botón hamburguesa (aparece solo si el menú está oculto) */}
        {!menuVisible && (
          <button onClick={() => setMenuVisible(true)} style={{ margin: 15, padding: '10px 20px', cursor: 'pointer', background: '#e2e8f0', border: 'none', borderRadius: '4px' }}>
            ≡ Menú
          </button>
        )}

        {/* CONTENEDOR DE LA VISTA ACTIVA */}
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