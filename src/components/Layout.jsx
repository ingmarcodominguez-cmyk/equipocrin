import { useState, useEffect, useRef } from 'react' // 1. Agregamos useRef
import AgendaMensualPro from './AgendaMensualPro.jsx'
import AgendaFija from './AgendaFija.jsx'
import Tasks from './Tasks.jsx'
import Dashboard from './Dashboard.jsx'

function Layout({ userData, logout }) {
  const [vista, setVista] = useState(localStorage.getItem('vista') || 'dashboard')
  
  // 2. Creamos la referencia del sonido
  const audioRef = useRef(new Audio('/notificacion.mp3'));

  useEffect(() => {
    localStorage.setItem('vista', vista)
  }, [vista])

  // 3. Función para reproducir sonido desde cualquier lado
  const playNotification = () => {
    audioRef.current.play().catch(e => console.log("Necesitamos interacción previa"));
  };

  if (!userData) return <div>Cargando...</div>

  const rol = userData?.rol?.toLowerCase();
  const esAdministrativo = rol === 'administracion' || rol === 'direccion';

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }} onClick={playNotification}> {/* 4. El clic en cualquier lado activa el audio */}
      {/* MENÚ LATERAL IZQUIERDO */}
      <div style={{ width: 250, backgroundColor: '#0f172a', color: 'white', padding: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <button style={btnStyle} onClick={() => setVista('dashboard')}>🏠 Menú Principal</button>
          {esAdministrativo && <button style={btnStyle} onClick={() => setVista('agenda')}>📅 Agenda Mensual</button>}
          <button style={btnStyle} onClick={() => setVista('tareas')}>✅ Tareas</button>
          <button style={btnStyle} onClick={() => setVista('profesionales')}>⚙️ Agenda Fija</button>
        </div>
        <div style={{ marginTop: 40 }}>
          <button onClick={logout} style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', width: '100%' }}>Cerrar sesión</button>
        </div>
      </div>

      {/* ÁREA DERECHA */}
      <div style={{ flex: 1 }}>
        <div style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '20px', borderBottom: '1px solid #ddd' }}>
          <img src="https://gqhfrzvtccxrixdtazzs.supabase.co/storage/v1/object/public/logo%20crin/photo.jpg" alt="Logo" style={{ width: '80px', height: '80px', borderRadius: '50%' }} />
          <div>
            <h2 style={{ margin: 0 }}>{userData?.nombre}</h2>
            <p style={{ margin: 0, textTransform: 'uppercase', color: '#666' }}>{userData?.rol}</p>
          </div>
        </div>

        <div style={{ padding: '20px' }}>
          {vista === 'dashboard' && <Dashboard userData={userData} setVista={setVista} />}
          {vista === 'agenda' && esAdministrativo && <AgendaMensualPro userData={userData} />}
          {/* 5. Pasamos la función playNotification a Tasks */}
          {vista === 'tareas' && <Tasks userData={userData} playNotification={playNotification} />}
          {vista === 'profesionales' && <AgendaFija userData={userData} />}
        </div>
      </div>
    </div>
  )
}

const btnStyle = { background: 'none', border: 'none', color: 'white', textAlign: 'left', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }

export default Layout