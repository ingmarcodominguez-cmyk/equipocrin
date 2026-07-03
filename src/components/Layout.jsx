import { useState, useRef } from 'react'
import AgendaMensualPro from './AgendaMensualPro.jsx'
import AgendaFija from './AgendaFija.jsx'
import Tasks from './Tasks.jsx'
import GestionPacientes from './GestionPacientes.jsx'
import EstadosCuenta from './EstadosCuenta.jsx'
import MovimientosPrestadores from './MovimientosPrestadores.jsx'
import Documentos from './Documentos.jsx' // Asegúrate de tener este archivo creado
import logo from '../assets/photo.jpg'

function Layout({ userData, logout }) {
  // --- INTERRUPTOR DE BLOQUEO ---
  const MANTENIMIENTO = false; 
  if (MANTENIMIENTO) {
    return <div style={{ backgroundColor: '#000', height: '100vh', width: '100%' }}></div>;
  }
  // -------------------------------

  const [vista, setVista] = useState('hub') // Arrancamos directo en el hub
  const audioRef = useRef(new Audio('/notificacion.mp3'))
  const playNotification = () => audioRef.current.play().catch(e => {})
  
  const rol = userData?.rol?.toUpperCase() || ""
  const tieneAccesoTotal = ['ADMINISTRACION', 'DIRECCION', 'PROFESIONAL_PLUS'].includes(rol)
  const esAdminOrDir = ['ADMINISTRACION', 'DIRECCION'].includes(rol)
  const esDireccion = rol === 'DIRECCION'

  return (
    <div style={{ backgroundColor: '#000', minHeight: '100vh', color: '#fff', padding: '20px', fontFamily: 'sans-serif' }}>
      
      {vista === 'hub' && (
        <div style={{ maxWidth: '600px', margin: 'auto', paddingTop: '5vh' }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
             <img src={logo} alt="Logo" style={{ width: 120, borderRadius: '20px' }} />
             <h2>Hola, {userData?.nombre || 'Usuario'}</h2>
          </div>
          
          <div style={{ display: 'grid', gap: '20px' }}>
            {tieneAccesoTotal && (
              <button onClick={() => setVista('agenda')} style={btnHubStyle}>📅 AGENDA MENSUAL</button>
            )}
            <button onClick={() => setVista('tareas')} style={btnHubStyle}>✅ TAREAS</button>
            <button onClick={() => setVista('profesionales')} style={btnHubStyle}>⚙️ AGENDA FIJA</button>
            
            {esAdminOrDir && (
              <>
                <button onClick={() => setVista('pacientes')} style={btnHubStyle}>👤 GESTIÓN PACIENTES</button>
                <button onClick={() => setVista('documentos')} style={{...btnHubStyle, borderColor: '#fff'}}>📁 DOCUMENTOS</button>
              </>
            )}

            {esDireccion && (
              <>
                <button onClick={() => setVista('movimientos')} style={{...btnHubStyle, borderColor: '#75AADB'}}>📊 MOV. PRESTADORES</button>
                <button onClick={() => setVista('estados')} style={{...btnHubStyle, borderColor: '#00f2ff'}}>💰 ESTADOS DE CUENTA</button>
              </>
            )}
          </div>
          <button onClick={logout} style={btnCerrarStyle}>Cerrar Sesión</button>
        </div>
      )}

      {['agenda', 'tareas', 'profesionales', 'pacientes', 'estados', 'movimientos', 'documentos'].includes(vista) && (
        <div style={{ maxWidth: '1200px', margin: 'auto' }}>
          <button onClick={() => setVista('hub')} style={btnVolverStyle}>← VOLVER AL MENÚ</button>
          <div style={{ backgroundColor: '#111', padding: 20, borderRadius: 15, marginTop: 10 }}>
            {vista === 'agenda' && <AgendaMensualPro userData={userData} />}
            {vista === 'tareas' && <Tasks userData={userData} playNotification={playNotification} />}
            {vista === 'profesionales' && <AgendaFija userData={userData} />}
            {vista === 'pacientes' && <GestionPacientes />}
            {vista === 'estados' && <EstadosCuenta />}
            {vista === 'movimientos' && <MovimientosPrestadores />}
            {vista === 'documentos' && <Documentos />}
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