import { useState, useRef } from 'react'
import AgendaMensualPro from './AgendaMensualPro.jsx'
import AgendaFija from './AgendaFija.jsx'
import Tasks from './Tasks.jsx'
import logo from '../assets/photo.jpg'; 

function Layout({ userData, logout }) {
  const [vista, setVista] = useState('bienvenida'); 
  const audioRef = useRef(new Audio('/notificacion.mp3'));
  const playNotification = () => audioRef.current.play().catch(e => {});
  
  // Lógica clara de acceso: Solo estos 3 tienen acceso total a la Agenda Mensual
  const rol = userData?.rol?.toUpperCase() || "";
  const tieneAccesoTotal = ['ADMINISTRACION', 'DIRECCION', 'PROFESIONAL_PLUS'].includes(rol);

  return (
    <div style={{ backgroundColor: '#000', minHeight: '100vh', color: '#fff', padding: '20px', fontFamily: 'sans-serif' }}>
      
      {vista === 'bienvenida' && (
        <div style={{ textAlign: 'center', marginTop: '15vh' }}>
          <img src={logo} alt="Logo" style={{ width: 220, borderRadius: '20px', marginBottom: 30 }} />
          <h1>Bienvenido</h1>
          <h2 style={{ color: '#00f2ff', textTransform: 'uppercase' }}>{userData?.nombre || 'Usuario'}</h2>
          <button onClick={() => setVista('hub')} style={btnHubStyle}>ENTRAR AL MENÚ</button>
        </div>
      )}

      {vista === 'hub' && (
        <div style={{ maxWidth: '600px', margin: 'auto', paddingTop: '5vh' }}>
          <h2 style={{ textAlign: 'center' }}>Menú Principal</h2>
          <div style={{ display: 'grid', gap: '20px' }}>
            {tieneAccesoTotal && (
              <button onClick={() => setVista('agenda')} style={btnHubStyle}>📅 AGENDA MENSUAL</button>
            )}
            <button onClick={() => setVista('tareas')} style={btnHubStyle}>✅ TAREAS</button>
            <button onClick={() => setVista('profesionales')} style={btnHubStyle}>⚙️ AGENDA FIJA</button>
          </div>
          <button onClick={logout} style={btnCerrarStyle}>Cerrar Sesión</button>
        </div>
      )}

      {['agenda', 'tareas', 'profesionales'].includes(vista) && (
        <div style={{ maxWidth: '1200px', margin: 'auto' }}>
          <button onClick={() => setVista('hub')} style={btnVolverStyle}>← VOLVER</button>
          <div style={{ backgroundColor: '#111', padding: 20, borderRadius: 15, marginTop: 10 }}>
            {vista === 'agenda' && <AgendaMensualPro userData={userData} />}
            {vista === 'tareas' && <Tasks userData={userData} playNotification={playNotification} />}
            {vista === 'profesionales' && <AgendaFija userData={userData} />}
          </div>
        </div>
      )}
    </div>
  )
}

const btnHubStyle = { padding: '20px', background: '#111', color: '#fff', border: '1px solid #333', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' };
const btnVolverStyle = { background: '#333', color: '#fff', border: 'none', padding: '10px', borderRadius: '5px', cursor: 'pointer' };
const btnCerrarStyle = { marginTop: 40, background: 'none', color: '#ff4444', border: '1px solid #ff4444', padding: '10px', width: '100%' };

export default Layout;