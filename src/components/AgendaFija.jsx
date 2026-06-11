import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function AgendaFija({ userData }) {
  const [sesiones, setSesiones] = useState([])
  const [pacientes, setPacientes] = useState([])
  const [users, setUsers] = useState([])
  
  const [editId, setEditId] = useState(null)
  const [editData, setEditData] = useState({})
  const [diaConsulta, setDiaConsulta] = useState('Lunes') 
  const [profesionalFiltroId, setProfesionalFiltroId] = useState('') 

  const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
  const rol = userData?.rol?.toUpperCase();
  const esAdminOdireccion = rol === 'ADMINISTRACION' || rol === 'DIRECCION';

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: sData } = await supabase.from('sesiones_fijas').select('*');
    const { data: pData } = await supabase.from('pacientes').select('*').order('nombre', { ascending: true });
    const { data: uData } = await supabase.from('users').select('*').order('nombre', { ascending: true });
    setSesiones(sData || []); setPacientes(pData || []); setUsers(uData || []);
  }

  // Lógica de filtrado: Administradores ven todo o filtran, profesionales solo lo propio
  let sesionesVisibles = esAdminOdireccion && profesionalFiltroId 
    ? sesiones.filter(s => s.profesional_id === profesionalFiltroId)
    : (!esAdminOdireccion ? sesiones.filter(s => s.profesional_id === userData.id) : sesiones);

  const horasDelDia = sesionesVisibles.filter(s => s.dia_semana === diaConsulta).sort((a,b) => a.hora.localeCompare(b.hora));

  async function cambiarAsistencia(id, nuevoValor) {
    await supabase.from('sesiones_fijas').update({ asistencia: nuevoValor }).eq('id', id);
    cargarDatos();
  }

  const getAsistenciaColor = (valor) => {
    switch(valor) {
      case 'Presente': return '#00331a';
      case 'Ausente': return '#330000';
      case 'Cancelado': return '#222';
      default: return 'transparent';
    }
  }

  return (
    <div style={{ color: '#fff', padding: '20px', maxWidth: '1000px', margin: 'auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: '#00f2ff' }}>📅 Agenda Semanal</h2>
        {esAdminOdireccion && (
          <select style={inputStyle} onChange={(e) => setProfesionalFiltroId(e.target.value)}>
            <option value="">Todos los profesionales</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', overflowX: 'auto' }}>
        {dias.map(d => (
          <button key={d} onClick={() => setDiaConsulta(d)} style={btnTabStyle(diaConsulta === d)}>
            {d.substring(0,3).toUpperCase()} ({sesionesVisibles.filter(s => s.dia_semana === d).length})
          </button>
        ))}
      </div>

      <div style={cardStyle}>
        {horasDelDia.map(s => (
          <div key={s.id} style={{...filaStyle, background: getAsistenciaColor(s.asistencia)}}>
            <span style={{ fontWeight: 'bold', width: '80px' }}>{s.hora}</span>
            <span style={{ flexGrow: 1 }}>
              {s.paciente_nombre} 
              <small style={{ marginLeft: '10px', opacity: 0.7 }}>({users.find(u => u.id === s.profesional_id)?.nombre})</small>
            </span>
            
            <select 
              value={s.asistencia || 'Pendiente'} 
              onChange={(e) => cambiarAsistencia(s.id, e.target.value)} 
              style={{ background: 'transparent', border: '1px solid #444', color: '#fff', borderRadius: '4px', padding: '4px' }}
            >
              <option value="Pendiente">⏳ Pendiente</option>
              <option value="Presente">✅ Presente</option>
              <option value="Ausente">❌ Ausente</option>
              <option value="Cancelado">🚫 Cancelado</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

const cardStyle = { background: '#0a0a0a', border: '1px solid #333', borderRadius: '15px', padding: '20px' };
const inputStyle = { background: '#000', border: '1px solid #444', color: '#fff', padding: '10px', borderRadius: '8px' };
const filaStyle = { padding: '12px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', transition: '0.3s' };
const btnTabStyle = (activo) => ({ padding: '10px 15px', borderRadius: '8px', border: activo ? '1px solid #00f2ff' : '1px solid #333', background: activo ? '#00f2ff' : 'transparent', color: activo ? '#000' : '#fff', cursor: 'pointer', fontWeight: 'bold' });

export default AgendaFija;