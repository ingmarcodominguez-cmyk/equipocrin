import { useState, useRef, useEffect } from 'react'
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
import { supabase } from '../lib/supabase'
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
  const [tienePerfilAuxiliar, setTienePerfilAuxiliar] = useState(false)
  const [tienePerfilPrestador, setTienePerfilPrestador] = useState(false)
  const audioRef = useRef(new Audio('/notificacion.mp3'))
  const playNotification = () => audioRef.current.play().catch(e => {})
  
  const rol = userData?.rol?.toUpperCase() || ""
  const tieneAccesoTotal = ['ADMINISTRACION', 'DIRECCION', 'PROFESIONAL_PLUS'].includes(rol)
  const esAdminOrDir = ['ADMINISTRACION', 'DIRECCION'].includes(rol)
  const esDireccion = rol === 'DIRECCION'
  
  // Definimos la condición para ver documentos
  const puedeVerDocumentos = ['DIRECCION', 'PROFESIONAL_PLUS'].includes(rol)

  // Verificación dinámica de perfiles para usuarios duales (Auxiliar y Profesional al mismo tiempo)
  useEffect(() => {
    if (!userData?.nombre) return;

    const normalizar = (txt) => {
      if (!txt) return '';
      return txt.toLowerCase()
        .replace(/[\uFFFD]/g, 'n')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/([a-z])\1+/g, '$1')
        .trim();
    };

    const matchNombre = (uName, targetName) => {
      if (!uName || !targetName) return false;
      const uNorm = normalizar(uName);
      const tNorm = normalizar(targetName);
      if (uNorm === tNorm) return true;
      const uWords = uNorm.split(/\s+/).filter(w => w.length >= 2);
      const tWords = tNorm.split(/\s+/).filter(w => w.length >= 2);
      if (uWords.length > 0 && uWords.every(w => tWords.includes(w))) return true;
      if (uWords.filter(w => tWords.includes(w)).length >= 2) return true;
      return false;
    };

    const verificarPerfiles = async () => {
      try {
        // 1. Verificar si existe en auxiliares_motor
        const { data: auxList } = await supabase
          .from('auxiliares_motor')
          .select('id_auxiliar, nombre');
        if (auxList && auxList.length > 0) {
          const matchAux = auxList.some(a => matchNombre(userData.nombre, a.nombre));
          if (matchAux) setTienePerfilAuxiliar(true);
        }

        // 2. Verificar si existe en prestadores_motor
        const { data: prestList } = await supabase
          .from('prestadores_motor')
          .select('id_prestador, nombre_prestador');
        if (prestList && prestList.length > 0) {
          const matchPrest = prestList.some(p => matchNombre(userData.nombre, p.nombre_prestador));
          if (matchPrest) setTienePerfilPrestador(true);
        }
      } catch (e) {
        console.error("Error al verificar perfiles duales:", e);
      }
    };

    verificarPerfiles();
  }, [userData?.nombre]);

  // Condición para ver Mi Liquidación (Auxiliares, Dirección/Administración y usuarios con perfil auxiliar)
  const puedeVerMiLiquidacion = ['AUXILIAR', 'ADMINISTRACION', 'DIRECCION'].includes(rol) || tienePerfilAuxiliar;

  // Condición para ver Cuenta Corriente de Prestador / Profesional
  const puedeVerCuentaCorriente = ['PROFESIONAL', 'PROFESIONAL_PLUS', 'DIRECCION'].includes(rol) || tienePerfilPrestador;
  const esPerfilDual = puedeVerMiLiquidacion && puedeVerCuentaCorriente && !esAdminOrDir;

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
                    💰 {esPerfilDual ? 'Liquidación Auxiliar (Rápido)' : 'Modal Rápido Liquidación'}
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

            {/* MI LIQUIDACIÓN Y HORAS: ACCESIBLE PARA AUXILIARES (Y DIRECCION/ADMINISTRACION/DUALES) */}
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
                💰 {esPerfilDual ? 'MI LIQUIDACIÓN Y HORAS (AUXILIAR)' : 'MI LIQUIDACIÓN Y HORAS'}
              </button>
            )}

            {/* DOCUMENTOS SOLO PARA DIRECCIÓN Y PROFESIONAL_PLUS */}
            {puedeVerDocumentos && (
              <button onClick={() => setVista('documentos')} style={{...btnHubStyle, borderColor: '#fff'}}>📁 DOCUMENTOS</button>
            )}

            {/* MI CUENTA CORRIENTE (PRESTADOR / PROFESIONAL) */}
            {puedeVerCuentaCorriente && (
              <button onClick={() => setVista('movimientos')} style={{...btnHubStyle, borderColor: '#75AADB'}}>
                {rol === 'DIRECCION' ? '📊 MOV. PRESTADORES' : (esPerfilDual ? '📊 MI CUENTA CORRIENTE (PROFESIONAL)' : '📊 MI CUENTA CORRIENTE')}
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