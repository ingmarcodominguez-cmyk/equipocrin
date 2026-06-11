import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function AgendaFija({ userData }) {
  const [sesiones, setSesiones] = useState([])
  const [pacientes, setPacientes] = useState([])
  const [users, setUsers] = useState([])
  
  const [dia, setDia] = useState('Lunes')
  const [hora, setHora] = useState('09:00')
  const [horarioManual, setHorarioManual] = useState('')
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState('')
  const [prestadorSeleccionado, setPrestadorSeleccionado] = useState('')
  const [editId, setEditId] = useState(null)
  
  const [diaConsulta, setDiaConsulta] = useState('Lunes') 
  const [profesionalFiltroId, setProfesionalFiltroId] = useState('') 
  const [pacienteConsultaId, setPacienteConsultaId] = useState('') 
  const [filtroPaciente, setFiltroPaciente] = useState('')

  const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
  const rol = userData?.rol?.toUpperCase();
  const esAdminOdireccion = rol === 'ADMINISTRACION' || rol === 'DIRECCION';

  // Lógica de saltos de 45 min
  const generarHorarios = () => {
    const arr = [];
    const rangos = [{ inicio: 9, fin: 12, minFin: 30 }, { inicio: 14, fin: 20, minFin: 0 }];
    rangos.forEach(({ inicio, fin, minFin }) => {
      let h = inicio, m = 0;
      while (h < fin || (h === fin && m <= minFin)) {
        arr.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        m += 45;
        if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
      }
    });
    return arr;
  };

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    const { data: sData } = await supabase.from('sesiones_fijas').select('*');
    const { data: pData } = await supabase.from('pacientes').select('*').order('nombre', { ascending: true });
    const { data: uData } = await supabase.from('users').select('*').order('nombre', { ascending: true });
    setSesiones(sData || []); setPacientes(pData || []); setUsers(uData || []);
  }

  async function guardarSesion() {
    const horaFinal = horarioManual.trim() !== '' ? horarioManual : hora;
    const p = pacientes.find(p => String(p.id) === String(pacienteSeleccionado));
    const payload = { paciente_id: pacienteSeleccionado, paciente_nombre: p?.nombre || 'Desconocido', profesional_id: prestadorSeleccionado, dia_semana: dia, hora: horaFinal, asistencia: 'Pendiente' };
    
    if (editId) { await supabase.from('sesiones_fijas').update(payload).eq('id', editId); setEditId(null); } 
    else { await supabase.from('sesiones_fijas').insert([payload]); }
    
    await cargarDatos(); alert('Sesión guardada');
  }

  function iniciarEdicion(s) {
    setEditId(s.id); setDia(s.dia_semana); setHora(s.hora); setHorarioManual('');
    setPacienteSeleccionado(String(s.paciente_id)); setPrestadorSeleccionado(String(s.profesional_id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  let sesionesVisibles = esAdminOdireccion 
    ? (profesionalFiltroId ? sesiones.filter(s => s.profesional_id === profesionalFiltroId) : sesiones)
    : sesiones.filter(s => s.profesional_id === userData.id);

  const horasDelDia = sesionesVisibles.filter(s => s.dia_semana === diaConsulta).sort((a,b) => a.hora.localeCompare(b.hora));
  const pacientesFiltrados = pacientes.filter(p => p.nombre.toLowerCase().includes(filtroPaciente.toLowerCase()));

  return (
    <div style={{ color: '#fff', padding: '20px', maxWidth: '1200px', margin: 'auto' }}>
      
      {/* FORMULARIO */}
      <div style={{...cardStyle, marginBottom: '20px'}}>
        <h3 style={{ color: '#00f2ff' }}>{editId ? '✏️ Editar Sesión' : '➕ Nueva Sesión'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
          <select style={inputStyle} value={dia} onChange={(e) => setDia(e.target.value)}>{dias.map(d => <option key={d} value={d}>{d}</option>)}</select>
          <select style={inputStyle} value={hora} onChange={(e) => { setHora(e.target.value); setHorarioManual(''); }}>{generarHorarios().map(h => <option key={h} value={h}>{h}</option>)}</select>
          <input style={inputStyle} placeholder="Hora manual" value={horarioManual} onChange={(e) => setHorarioManual(e.target.value)} />
          <select style={inputStyle} value={pacienteSeleccionado} onChange={(e) => setPacienteSeleccionado(e.target.value)}><option value="">Paciente...</option>{pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
          <select style={inputStyle} value={prestadorSeleccionado} onChange={(e) => setPrestadorSeleccionado(e.target.value)}><option value="">Profesional...</option>{users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
          <button onClick={guardarSesion} style={btnAccionStyle}>{editId ? 'ACTUALIZAR' : 'GUARDAR'}</button>
          {editId && <button onClick={() => setEditId(null)} style={{...btnAccionStyle, background: '#444'}}>CANCELAR</button>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        {/* AGENDA */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ color: '#00f2ff' }}>📅 Agenda</h2>
            {esAdminOdireccion && (
              <select style={inputStyle} onChange={(e) => setProfesionalFiltroId(e.target.value)}>
                <option value="">Todos los profesionales</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            )}
          </div>
          <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
            {dias.map(d => <button key={d} onClick={() => setDiaConsulta(d)} style={btnTabStyle(diaConsulta === d)}>{d.substring(0,3)}</button>)}
          </div>
          <div style={cardStyle}>
            {horasDelDia.map(s => (
              <div key={s.id} style={filaStyle}>
                <span style={{ fontWeight: 'bold', width: '80px' }}>{s.hora}</span>
                <span style={{ flexGrow: 1 }}>{s.paciente_nombre}</span>
                <button onClick={() => iniciarEdicion(s)} style={{background: 'none', border: 'none', color: '#00f2ff'}}>✏️</button>
              </div>
            ))}
          </div>
        </div>

        {/* AUDITORÍA */}
        <div style={cardStyle}>
          <h3 style={{ color: '#00f2ff' }}>🔎 Auditoría Paciente</h3>
          <input style={{...inputStyle, width: '100%', marginBottom: '10px'}} placeholder="Buscar nombre..." onChange={(e) => setFiltroPaciente(e.target.value)} />
          <select style={{...inputStyle, width: '100%'}} onChange={(e) => setPacienteConsultaId(e.target.value)} size={8}>
            {pacientesFiltrados.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <div style={{marginTop: '10px'}}>
            {sesiones.filter(s => String(s.paciente_id) === String(pacienteConsultaId)).map(s => (
              <div key={s.id} style={{ padding: '8px', background: '#1a1a1a', borderRadius: '5px', marginTop: '5px', fontSize: '0.8rem' }}>
                <strong>{s.dia_semana}</strong> - {s.hora} hs | {users.find(u => u.id === s.profesional_id)?.nombre}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const cardStyle = { background: '#0a0a0a', border: '1px solid #333', borderRadius: '15px', padding: '20px' };
const inputStyle = { background: '#000', border: '1px solid #444', color: '#fff', padding: '8px', borderRadius: '8px' };
const btnAccionStyle = { background: '#00f2ff', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', padding: '8px' };
const filaStyle = { padding: '10px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center' };
const btnTabStyle = (activo) => ({ padding: '8px 12px', borderRadius: '5px', border: 'none', background: activo ? '#00f2ff' : '#222', color: activo ? '#000' : '#fff', cursor: 'pointer' });

export default AgendaFija;