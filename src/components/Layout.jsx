import { useState, useEffect } from 'react'
import AgendaMensualPro from './AgendaMensualPro.jsx'
import AgendaFija from './AgendaFija.jsx'
import Tasks from './Tasks.jsx'
import Dashboard from './Dashboard.jsx'

function Layout({ userData, logout }) {
  const [vista, setVista] = useState(localStorage.getItem('vista') || 'dashboard')

  useEffect(() => {
    localStorage.setItem('vista', vista)
  }, [vista])

  if (!userData) return <div>Cargando...</div>

  // Lógica de seguridad ajustada a tus roles reales: ADMINISTRACION y DIRECCION
  const esAdministrativo = userData?.rol === 'ADMINISTRACION' || userData?.rol === 'DIRECCION';

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Menú Lateral igual a image_c78036.png */}
      <div style={{ width: 250, backgroundColor: '#0f172a', color: 'white', padding: 20 }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: 5 }}>CRIN</h2>
        <p style={{ fontWeight: 'bold', margin: 0 }}>{userData?.nombre}</p>
        <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>{userData?.rol}</p>
        <hr style={{ margin: '20px 0', borderColor: '#334155' }} />
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <button style={btnStyle} onClick={() => setVista('dashboard')}>🏠 Menú Principal</button>
          
          {/* Solo ADMINISTRACION y DIRECCION ven la Agenda Mensual */}
          {esAdministrativo && (
            <button style={btnStyle} onClick={() => setVista('agenda')}>📅 Agenda Mensual</button>
          )}
          
          <button style={btnStyle} onClick={() => setVista('tareas')}>✅ Tareas</button>
          <button style={btnStyle} onClick={() => setVista('profesionales')}>⚙️ Agenda Fija</button>
        </div>

        <div style={{ marginTop: 40 }}>
          <button 
            onClick={logout} 
            style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Contenido */}
      <div style={{ flex: 1, padding: 20 }}>
        {vista === 'dashboard' && <Dashboard userData={userData} setVista={setVista} />}
        {vista === 'agenda' && esAdministrativo && <AgendaMensualPro userData={userData} />}
        {vista === 'tareas' && <Tasks userData={userData} />}
        {vista === 'profesionales' && <AgendaFija userData={userData} />}
      </div>
    </div>
  )
}

// Estilo base tal cual lo tenías
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