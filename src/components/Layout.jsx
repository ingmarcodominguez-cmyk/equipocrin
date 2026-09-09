import { useState, useRef } from 'react'
import AgendaMensualPro from './AgendaMensualPro.jsx'
import AgendaFija from './AgendaFija.jsx'
import Tasks from './Tasks.jsx'
import GestionPacientes from './GestionPacientes.jsx'
import EstadosCuenta from './EstadosCuenta.jsx'
import MovimientosPrestadores from './MovimientosPrestadores.jsx'
import Documentos from './Documentos.jsx'
import AsistenciaPacientes from './AsistenciaPacientes.jsx'
import MiLiquidacionAuxiliar from './MiLiquidacionAuxiliar.jsx'
import BotonPantallaCompleta from './BotonPantallaCompleta.jsx'
import logo from '../assets/photo.jpg'

function Layout({ userData, logout, actualizarMoraYCuotas }) {
  // --- INTERRUPTOR DE BLOQUEO ---
  const MANTENIMIENTO = false; 
  if (MANTENIMIENTO) {
    return <div style={{ backgroundColor: '#000', height: '100vh', width: '100%' }}></div>;
  }
  // -------------------------------

  const [vista, setVista] = useState('hub') 
  const [modalMiLiqAbierto, setModalMiLiqAbierto] = useState(false)
  const audioRef = useRef(new Audio('/notificacion.mp3'))
  const playNotification = () => audioRef.current.play().catch(e => {})
  
  const rol = userData?.rol?.toUpperCase() || ""
  const tieneAccesoTotal = ['ADMINISTRACION', 'DIRECCION', 'PROFESIONAL_PLUS'].includes(rol)
  const esAdminOrDir = ['ADMINISTRACION', 'DIRECCION'].includes(rol)
  const esDireccion = rol === 'DIRECCION'
  
  // Definimos la condición para ver documentos
  const puedeVerDocumentos = ['DIRECCION', 'PROFESIONAL_PLUS'].includes(rol)

  // Condición para ver Mi Liquidación (Auxiliares y Dirección/Administración para control)
  const puedeVerMiLiquidacion = ['AUXILIAR', 'ADMINISTRACION', 'DIRECCION'].includes(rol)

  return (
    <div style={{ backgroundColor: '#000', minHeight: '100vh', color: '#fff', padding: '20px', fontFamily: 'sans-serif' }}>
      
      {vista === 'hub' && (
        <div style={{ maxWidth: '600px', margin: 'auto', paddingTop: '5vh' }}>
          <div style={{ textAlign: 'center', marginBottom: '25px' }}>
             <img src={logo} alt="Logo" style={{ width: 120, borderRadius: '20px' }} />
             <h2 style={{ margin: '10px 0' }}>Hola, {userData?.nombre || 'Usuario'}</h2>
             <div style={{ marginTop: '8px', display: 'flex', gap: '10px', justifyContent: 'center', alignItems: 'center' }}>
                <BotonPantallaCompleta />
                {puedeVerMiLiquidacion && (
                  <button
                    onClick={() => setModalMiLiqAbierto(true)}
                    style={{
                      background: '#064e3b',
                      color: '#6ee7b7',
                      border: '1px solid #10b981',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    💰 Modal Rápido Liquidación
                  </button>
                )}
              </div>
          </div>
          
          <div style={{ display: 'grid', gap: '20px' }}>
            {tieneAccesoTotal && (
              <button onClick={() => setVista('agenda')} style={btnHubStyle}>📅 AGENDA MENSUAL</button>
            )}
            <button onClick={() => setVista('tareas')} style={btnHubStyle}>✅ TAREAS</button>
            <button onClick={() => setVista('profesionales')} style={btnHubStyle}>⚙️ AGENDA FIJA</button>
            
            {tieneAccesoTotal && (
              <button onClick={() => setVista('asistencia_pacientes')} style={{...btnHubStyle, borderColor: '#f43f5e'}}>📋 ASISTENCIA PACIENTES</button>
            )}
            
            {/* GESTIÓN PACIENTES ACCESIBLE PARA TODOS */}
            <button onClick={() => setVista('pacientes')} style={{...btnHubStyle, borderColor: '#00f2ff'}}>👤 GESTIÓN PACIENTES</button>

            {/* MI LIQUIDACIÓN Y HORAS: ACCESIBLE PARA AUXILIARES (Y DIRECCION/ADMINISTRACION PARA AUDITORIA) */}
            {puedeVerMiLiquidacion && (
              <button 
                onClick={() => setVista('mi_liquidacion')} 
                style={{
                  ...btnHubStyle, 
                  borderColor: '#10b981', 
                  background: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)', 
                  color: '#6ee7b7',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                }}
              >
                💰 MI LIQUIDACIÓN Y HORAS
              </button>
            )}

            {/* DOCUMENTOS SOLO PARA DIRECCIÓN Y PROFESIONAL_PLUS */}
            {puedeVerDocumentos && (
              <button onClick={() => setVista('documentos')} style={{...btnHubStyle, borderColor: '#fff'}}>📁 DOCUMENTOS</button>
            )}

            {(rol === 'PROFESIONAL' || rol === 'PROFESIONAL_PLUS' || rol === 'DIRECCION') && (
              <button onClick={() => setVista('movimientos')} style={{...btnHubStyle, borderColor: '#75AADB'}}>
                {rol === 'DIRECCION' ? '📊 MOV. PRESTADORES' : '📊 MI CUENTA CORRIENTE'}
              </button>
            )}
            
            {esDireccion && (
              <button onClick={() => setVista('estados')} style={{...btnHubStyle, borderColor: '#00f2ff'}}>💰 ESTADOS DE CUENTA</button>
            )}
          </div>
          <button onClick={logout} style={btnCerrarStyle}>Cerrar Sesión</button>
        </div>
      )}

      {['agenda', 'tareas', 'profesionales', 'pacientes', 'estados', 'movimientos', 'documentos', 'asistencia_pacientes', 'mi_liquidacion'].includes(vista) && (
        <div style={{ maxWidth: '1200px', margin: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <button onClick={() => setVista('hub')} style={btnVolverStyle}>← VOLVER AL MENÚ</button>
            <BotonPantallaCompleta />
          </div>
          <div style={{ backgroundColor: '#111', padding: 20, borderRadius: 15, marginTop: 10 }}>
            {vista === 'agenda' && <AgendaMensualPro userData={userData} />}
            {vista === 'tareas' && <Tasks userData={userData} playNotification={playNotification} />}
            {vista === 'profesionales' && <AgendaFija userData={userData} />}
            {vista === 'pacientes' && <GestionPacientes />}
            {vista === 'estados' && (
              <EstadosCuenta 
                actualizarMoraYCuotas={actualizarMoraYCuotas} 
                esAdminOrDir={esAdminOrDir} 
              />
            )}
            {vista === 'movimientos' && <MovimientosPrestadores userData={userData} />}
            {vista === 'documentos' && <Documentos />}
            {vista === 'asistencia_pacientes' && (
              <AsistenciaPacientes 
                onVolver={() => setVista('hub')} 
                usuario={userData?.nombre || userData?.nombre_apellido || 'Usuario'} 
              />
            )}
            {vista === 'mi_liquidacion' && (
              <MiLiquidacionAuxiliar 
                userData={userData} 
                onVolver={() => setVista('hub')} 
              />
            )}
          </div>
        </div>
      )}

      {/* Modal flotante rápido para consultar sin salir de la pantalla actual */}
      {modalMiLiqAbierto && (
        <MiLiquidacionAuxiliar 
          userData={userData} 
          esModal={true} 
          onCerrar={() => setModalMiLiqAbierto(false)} 
        />
      )}
    </div>
  )
}

const btnHubStyle = { padding: '20px', background: '#111', color: '#fff', border: '1px solid #333', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' };
const btnVolverStyle = { background: '#333', color: '#fff', border: 'none', padding: '10px', borderRadius: '5px', cursor: 'pointer' };
const btnCerrarStyle = { marginTop: 40, background: 'none', color: '#ff4444', border: '1px solid #ff4444', padding: '10px', width: '100%' };

export default Layout;