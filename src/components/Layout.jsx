import { useState, useEffect, useRef } from 'react'
import AgendaMensualPro from './AgendaMensualPro.jsx'
import AgendaFija from './AgendaFija.jsx'
import Tasks from './Tasks.jsx'
import logo from '../assets/photo.jpg'; 

function Layout({ userData, logout }) {
  // Persistencia: el sistema recuerda en qué pantalla estaba el usuario
  const [vista, setVista] = useState(localStorage.getItem('vistaActual') || 'bienvenida')
  


  const audioRef = useRef(new Audio('/notificacion.mp3'));
  
  useEffect(() => {
    localStorage.setItem('vistaActual', vista);
  }, [vista]);

  const playNotification = () => audioRef.current.play().catch(e => {});
  const esAdministrativo = userData?.rol?.toLowerCase() === 'administracion' || userData?.rol?.toLowerCase() === 'direccion';

  return (
    <div style={{ 
      backgroundColor: '#000', 
      minHeight: '100vh', 
      color: '#fff', 
      padding: '20px', 
      fontFamily: 'sans-serif' 
    }}>
      
      {/* 1. PANTALLA DE BIENVENIDA */}
      {vista === 'bienvenida' && (
        <div style={{ textAlign: 'center', marginTop: '15vh' }}>
          <img src={logo} alt="Logo CRIN" style={{ width: 220, borderRadius: '20px', marginBottom: 30, border: '1px solid #333' }} />
          <h1 style={{ fontSize: '2.5rem', marginBottom: 10 }}>Bienvenido</h1>
          <h2 style={{ color: '#00f2ff', textTransform: 'uppercase', marginBottom: 40 }}>{userData?.nombre}</h2>
          <button 
            onClick={() => setVista('hub')} 
            style={{ padding: '20px 50px', fontSize: '1.2rem', background: '#00f2ff', color: '#000', border: 'none', borderRadius: '50px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ENTRAR AL MENÚ PRINCIPAL
          </button>
        </div>
      )}

      {/* 2. MENÚ PRINCIPAL (HUB) */}
      {vista === 'hub' && (
        <div style={{ maxWidth: '600px', margin: 'auto', paddingTop: '5vh' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <img src={logo} alt="Logo CRIN" style={{ width: 120, borderRadius: '15px' }} />
            <h2 style={{ marginTop: 20 }}>Menú Principal</h2>
          </div>
          
          <div style={{ display: 'grid', gap: '20px' }}>
            {esAdministrativo && (
              <button onClick={() => setVista('agenda')} style={btnHubStyle}>
                📅 AGENDA MENSUAL
              </button>
            )}
            <button onClick={() => setVista('tareas')} style={btnHubStyle}>
              ✅ TAREAS
            </button>
            <button onClick={() => setVista('profesionales')} style={btnHubStyle}>
              ⚙️ AGENDA FIJA
            </button>
          </div>

          <button onClick={logout} style={btnCerrarStyle}>
            Cerrar Sesión
          </button>
        </div>
      )}

      {/* 3. VISTAS DE CONTENIDO */}
      {['agenda', 'tareas', 'profesionales'].includes(vista) && (
        <div style={{ maxWidth: '1200px', margin: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30, borderBottom: '1px solid #333', paddingBottom: 15 }}>
            <button onClick={() => setVista('hub')} style={btnVolverStyle}>
              ← VOLVER AL MENÚ
            </button>
            <img src={logo} alt="Logo" style={{ width: 50, borderRadius: '8px' }} />
          </div>
          
          <div style={{ backgroundColor: '#111', padding: 20, borderRadius: 15 }}>
            {vista === 'agenda' && <AgendaMensualPro userData={userData} />}
            {vista === 'tareas' && <Tasks userData={userData} playNotification={playNotification} />}
            {vista === 'profesionales' && <AgendaFija userData={userData} />}
          </div>
        </div>
      )}
    </div>
  )
}

// Estilos
const btnHubStyle = { 
  padding: '25px', 
  background: '#111', 
  color: '#fff', 
  border: '1px solid #333', 
  borderRadius: '15px', 
  cursor: 'pointer', 
  fontSize: '1.1rem', 
  textAlign: 'left', 
  fontWeight: 'bold' 
};

const btnVolverStyle = { 
  background: '#333', 
  color: '#fff', 
  border: 'none', 
  padding: '10px 20px', 
  borderRadius: '5px', 
  cursor: 'pointer' 
};

const btnCerrarStyle = { 
  marginTop: 40, 
  background: 'none', 
  color: '#ff4444', 
  border: '1px solid #ff4444', 
  padding: '10px', 
  width: '100%', 
  cursor: 'pointer', 
  borderRadius: '5px' 
};

export default Layout;