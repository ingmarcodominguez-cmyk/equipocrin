import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function AgendaFija({ userData }) {
  const [sesiones, setSesiones] = useState([])
  const [pacientes, setPacientes] = useState([])
  const [users, setUsers] = useState([])
  
  // Estados para Registro
  const [dia, setDia] = useState('Lunes')
  const [hora, setHora] = useState('09:00')
  const [horarioManual, setHorarioManual] = useState('')
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState('')
  const [prestadorSeleccionado, setPrestadorSeleccionado] = useState('')
  const [prestacion, setPrestacion] = useState('')
  
  // Estados para Vista
  const [diaConsulta, setDiaConsulta] = useState('Lunes') 
  const [profesionalFiltroId, setProfesionalFiltroId] = useState('') 

  const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
  const horarios = ['09:00', '09:45', '10:30', '11:15', '12:00', '12:45', '14:00', '14:45', '15:30', '16:15', '17:00', '17:45', '18:30', '19:15', '20:00']
  
  const rol = userData?.rol?.toUpperCase();
  const esAdminOdireccion = rol === 'ADMINISTRACION' || rol === 'DIRECCION';

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: sData } = await supabase.from('sesiones_fijas').select('*');
    const { data: pData } = await supabase.from('pacientes').select('*').order('nombre', { ascending: true });
    const { data: uData } = await supabase.from('users').select('*').order('nombre', { ascending: true });
    setSesiones(sData || []); setPacientes(pData || []); setUsers(uData || []);
  }

  async function agregarSesion() {
    const horaFinal = horarioManual.trim() !== '' ? horarioManual : hora;
    const p = pacientes.find(p => p.id === pacienteSeleccionado);
    if (!pacienteSeleccionado || !prestadorSeleccionado) return alert("Completa paciente y profesional");

    const { error } = await supabase.from('sesiones_fijas').insert([{
      paciente_id: pacienteSeleccionado, paciente_nombre: p?.nombre,
      profesional_id: prestadorSeleccionado, dia_semana: dia, hora: horaFinal, tipo_prestacion: prestacion, asistencia: 'Pendiente'
    }]);

    if (!error) { alert('Sesión guardada'); cargarDatos(); setHorarioManual(''); } else alert(error.message);
  }

  async function cambiarAsistencia(id, nuevoValor) {
    await supabase.from('sesiones_fijas').update({ asistencia: nuevoValor }).eq('id', id);
    cargarDatos();
  }

  // Filtrado
  let sesionesVisibles = esAdminOdireccion && profesionalFiltroId 
    ? sesiones.filter(s => s.profesional_id === profesionalFiltroId)
    : (!esAdminOdireccion ? sesiones.filter(s => s.profesional_id === userData.id) : sesiones);

  const horasDelDia = sesionesVisibles.filter(s => s.dia_semana === diaConsulta).sort((a,b) => a.hora.localeCompare(b.hora));

  return (
    <div style={{ color: '#fff', padding: '20px', maxWidth: '1000px', margin: 'auto' }}>
      
      {/* SECCIÓN DE CARGA */}
      {esAdminOdireccion && (
        <div style={{...cardStyle, marginBottom: '20px'}}>
          <h3 style={{ color: '#00f2ff', marginTop: 0 }}>➕ Nueva Sesión</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            <select style={inputStyle} onChange={(e) => setDia(e.target.value)}>{dias.map(d => <option key={d} value={d}>{d}</option>)}</select>
            <select style={inputStyle} onChange={(e) => { setHora(e.target.value); setHorarioManual(''); }}>{horarios.map(h => <option key={h} value={h}>{h}</option>)}</select>
            <input style={inputStyle} placeholder="Hora manual" value={horarioManual} onChange={(e) => setHorarioManual(e.target.value)} />
            <select style={inputStyle} onChange={(e) => setPacienteSeleccionado(e.target.value)}><option value="">Paciente...</option>{pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
            <select style={inputStyle} onChange={(e) => setPrestadorSeleccionado(e.target.value)}><option value="">Profesional...</option>{users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
            <button onClick={agregarSesion} style={btnAccionStyle}>GUARDAR</button>
          </div>
        </div>
      )}

      {/* FILTRO ADMIN */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: '#00f2ff' }}>📅 Agenda</h2>
        {esAdminOdireccion && (
          <select style={inputStyle} onChange={(e) => setProfesionalFiltroId(e.target.value)}>
            <option value="">Ver todos...</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        )}
      </div>

      {/* TABS Y GRILLA */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', overflowX: 'auto' }}>
        {dias.map(d => (
          <button key={d} onClick={() => setDiaConsulta(d)} style={btnTabStyle(diaConsulta === d)}>
            {d.substring(0,3).toUpperCase()} ({sesionesVisibles.filter(s => s.dia_semana === d).length})
          </button>
        ))}
      </div>

      <div style={cardStyle}>
        {horasDelDia.map(s => (
          <div key={s.id} style={{...filaStyle, background: s.asistencia === 'Presente' ? '#00331a' : s.asistencia === 'Ausente' ? '#330000' : 'transparent'}}>
            <span style={{ fontWeight: 'bold', width: '80px' }}>{s.hora}</span>
            <span style={{ flexGrow: 1 }}>{s.paciente_nombre} <small style={{ opacity: 0.6 }}>({users.find(u => u.id === s.profesional_id)?.nombre})</small></span>
            <select value={s.asistencia || 'Pendiente'} onChange={(e) => cambiarAsistencia(s.id, e.target.value)} style={selectStyle}>
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
const inputStyle = { background: '#000', border: '1px solid #444', color: '#fff', padding: '8px', borderRadius: '8px' };
const btnAccionStyle = { background: '#00f2ff', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };
const selectStyle = { background: 'transparent', border: '1px solid #444', color: '#fff', borderRadius: '4px', padding: '4px' };
const filaStyle = { padding: '12px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center' };
const btnTabStyle = (activo) => ({ padding: '10px 15px', borderRadius: '8px', border: activo ? '1px solid #00f2ff' : '1px solid #333', background: activo ? '#00f2ff' : 'transparent', color: activo ? '#000' : '#fff', cursor: 'pointer', fontWeight: 'bold' });

export default AgendaFija;