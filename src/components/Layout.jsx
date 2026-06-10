import { useState, useEffect, useRef } from 'react'
import AgendaMensualPro from './AgendaMensualPro.jsx'
import AgendaFija from './AgendaFija.jsx'
import Tasks from './Tasks.jsx'
import Dashboard from './Dashboard.jsx'

function Layout({ userData, logout }) {
  // Estado para la vista activa (por defecto 'dashboard')
  const [vista, setVista] = useState(localStorage.getItem('vista') || 'dashboard')
  const [menuVisible, setMenuVisible] = useState(window.innerWidth > 768)
  
  const audioRef = useRef(new Audio('/notificacion.mp3'));

  useEffect(() => {
    localStorage.setItem('vista', vista)
  }, [vista])

  const playNotification = () => {
    audioRef.current.play().catch(e => console.log("Interacción necesaria"));
  };

  if (!userData) return <div style={{ padding: 20 }}>Cargando datos...</div>

  const rol = userData?.rol?.toLowerCase();
  const esAdministrativo = rol === 'administracion' || rol === 'direccion';

  const cambiarVista = (nuevaVista) => {
    setVista(nuevaVista);
    // En móvil, al elegir una opción, el menú se oculta automáticamente
    if (window.innerWidth <= 768) setMenuVisible(false);
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative' }}>
      
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
          <button onClick={() => setMenuVisible(false)} style={{width: '100%', marginBottom: 20, padding: 10, cursor: 'pointer'}}>← Ocultar Menú</button>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <button style={btnStyle} onClick={() => cambiarVista('dashboard')}>🏠 Menú Principal</button>
            {esAdministrativo && <button style={btnStyle} onClick={() => cambiarVista('agenda')}>📅 Agenda Mensual</button>}
            <button style={btnStyle} onClick={() => cambiarVista('tareas')}>✅ Tareas</button>
            <button style={btnStyle} onClick={() => cambiarVista('profesionales')}>⚙️ Agenda Fija</button>
          </div>
          
          <button onClick={logout} style={{ marginTop: 50, width: '100%', backgroundColor: '#ef4444', color: 'white', border: 'none', padding: 10, cursor: 'pointer' }}>Cerrar Sesión</button>
        </div>
      )}

      {/* ÁREA DE CONTENIDO */}
      <div style={{ flex: 1, overflowX: 'hidden' }}>
        {!menuVisible && (
          <button onClick={() => setMenuVisible(true)} style={{ margin: 15, padding: '10px 20px', cursor: 'pointer' }}>≡ Menú</button>
        )}

        <div style={{ padding: 20 }}>
          {/* BOTÓN VOLVER (si no estamos en el dashboard) */}
          {vista !== 'dashboard' && (
            <button onClick={() => setVista('dashboard')} style={{ marginBottom: 20, padding: '8px 16px', cursor: 'pointer' }}>← Volver al Menú Principal</button>
          )}

          {/* VISTAS */}
          {vista === 'dashboard' && (
            <div>
              <h1>Bienvenido, {userData?.nombre}</h1>
              <div style={{ display: 'grid', gap: '15px', marginTop: 20 }}>
                {esAdministrativo && <button onClick={() => cambiarVista('agenda')} style={btnBig}>📅 Agenda Mensual</button>}
                <button onClick={() => cambiarVista('tareas')} style={btnBig}>✅ Tareas</button>
                <button onClick={() => cambiarVista('profesionales')} style={btnBig}>⚙️ Agenda Fija</button>
              </div>
            </div>
          )}
          
          {vista === 'agenda' && <AgendaMensualPro userData={userData} />}
          {vista === 'tareas' && <Tasks userData={userData} playNotification={playNotification} />}
          {vista === 'profesionales' && <AgendaFija userData={userData} />}
        </div>
      </div>
    </div>
  )
}

const btnStyle = { background: 'none', border: 'none', color: 'white', textAlign: 'left', fontSize: '1.1rem', cursor: 'pointer' };
const btnBig = { padding: '20px', fontSize: '1.2rem', cursor: 'pointer', borderRadius: '8px' };

export default Layout