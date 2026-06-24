import { useState, useRef } from 'react'
import confetti from 'canvas-confetti'
import AgendaMensualPro from './AgendaMensualPro.jsx'
import AgendaFija from './AgendaFija.jsx'
import Tasks from './Tasks.jsx'
import GestionPacientes from './GestionPacientes.jsx'
import logo from '../assets/photo.jpg'

function Layout({ userData, logout }) {
  const [vista, setVista] = useState('bienvenida')
  const [mostrandoMessi, setMostrandoMessi] = useState(false)
  const audioRef = useRef(new Audio('/notificacion.mp3'))
  const playNotification = () => audioRef.current.play().catch(e => {})
  
  const rol = userData?.rol?.toUpperCase() || ""
  const tieneAccesoTotal = ['ADMINISTRACION', 'DIRECCION', 'PROFESIONAL_PLUS'].includes(rol)
  const esAdminOrDir = ['ADMINISTRACION', 'DIRECCION'].includes(rol)

  const entrarAlMenuConFestejo = () => {
    // 1. Precargamos la imagen en memoria
    const img = new Image();
    img.src = '/messi-festejo.png';

    // 2. Disparamos el festejo solo cuando la imagen ya está lista
    img.onload = () => {
      confetti({ 
        particleCount: 200, 
        spread: 100, 
        origin: { y: 0.6 }, 
        colors: ['#75AADB', '#FFFFFF'] 
      });
      
      setMostrandoMessi(true);
      
      // 3. Duración aumentada a 5 segundos
      setTimeout(() => {
        setMostrandoMessi(false);
        setVista('hub');
      }, 2000);
    };
  };

  if (mostrandoMessi) {
    return (
      <div style={{ 
        backgroundColor: 'black', 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        {/* Mostramos solo la imagen que ya contiene el texto integrado */}
        <img 
          src="/messi-festejo.png" 
          alt="Messi" 
          style={{ width: '90%', maxWidth: '500px' }} 
        />
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: '#000', minHeight: '100vh', color: '#fff', padding: '20px', fontFamily: 'sans-serif' }}>
      
      {vista === 'bienvenida' && (
        <div style={{ textAlign: 'center', marginTop: '15vh' }}>
          <img src={logo} alt="Logo" style={{ width: 220, borderRadius: '20px', marginBottom: 30 }} />
          <h1>Bienvenido</h1>
          <h2 style={{ color: '#00f2ff', textTransform: 'uppercase' }}>{userData?.nombre || 'Usuario'}</h2>
          <button onClick={entrarAlMenuConFestejo} style={btnHubStyle}>ENTRAR AL MENÚ</button>
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
            
            {esAdminOrDir && (
              <button onClick={() => setVista('pacientes')} style={btnHubStyle}>👤 GESTIÓN PACIENTES</button>
            )}
          </div>
          <button onClick={logout} style={btnCerrarStyle}>Cerrar Sesión</button>
        </div>
      )}

      {['agenda', 'tareas', 'profesionales', 'pacientes'].includes(vista) && (
        <div style={{ maxWidth: '1200px', margin: 'auto' }}>
          <button onClick={() => setVista('hub')} style={btnVolverStyle}>← VOLVER</button>
          <div style={{ backgroundColor: '#111', padding: 20, borderRadius: 15, marginTop: 10 }}>
            {vista === 'agenda' && <AgendaMensualPro userData={userData} />}
            {vista === 'tareas' && <Tasks userData={userData} playNotification={playNotification} />}
            {vista === 'profesionales' && <AgendaFija userData={userData} />}
            {vista === 'pacientes' && <GestionPacientes />} 
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