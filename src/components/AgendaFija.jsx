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
  
  // Estados para Edición y Consulta
  const [editId, setEditId] = useState(null)
  const [editData, setEditData] = useState({})
  const [diaConsulta, setDiaConsulta] = useState('Lunes') 
  const [pacienteConsultaId, setPacienteConsultaId] = useState('') 
  const [filtroPaciente, setFiltroPaciente] = useState('')

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
      profesional_id: prestadorSeleccionado, dia_semana: dia, hora: horaFinal, tipo_prestacion: prestacion
    }]);

    if (!error) { alert('Sesión guardada'); cargarDatos(); setHorarioManual(''); } else alert(error.message);
  }

  async function guardarEdicion(id) {
    const { error } = await supabase.from('sesiones_fijas').update(editData).eq('id', id);
    if (!error) { setEditId(null); cargarDatos(); } else alert(error.message);
  }

  async function eliminarSesion(id) {
    if (window.confirm('¿Eliminar sesión?')) {
      await supabase.from('sesiones_fijas').delete().eq('id', id);
      cargarDatos();
    }
  }

  const sesionesVisibles = esAdminOdireccion ? sesiones : sesiones.filter(s => s.profesional_id === userData.id);
  const pacientesFiltrados = pacientes.filter(p => p.nombre.toLowerCase().includes(filtroPaciente.toLowerCase()));

  return (
    <div style={{ color: '#fff', padding: '20px' }}>
      {esAdminOdireccion && (
        <div style={cardStyle}>
          <h2 style={{ color: '#00f2ff', marginTop: 0 }}>➕ Registrar Sesión</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            <select style={inputStyle} onChange={(e) => setDia(e.target.value)}>{dias.map(d => <option key={d} value={d}>{d}</option>)}</select>
            <select style={inputStyle} onChange={(e) => { setHora(e.target.value); setHorarioManual(''); }}>{horarios.map(h => <option key={h} value={h}>{h}</option>)}</select>
            <input style={inputStyle} placeholder="Hora especial" value={horarioManual} onChange={(e) => setHorarioManual(e.target.value)} />
            <select style={inputStyle} onChange={(e) => setPacienteSeleccionado(e.target.value)}><option value="">Paciente...</option>{pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
            <select style={inputStyle} onChange={(e) => setPrestadorSeleccionado(e.target.value)}><option value="">Profesional...</option>{users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
            <input style={inputStyle} placeholder="Prestación" onChange={(e) => setPrestacion(e.target.value)} />
            <button onClick={agregarSesion} style={btnAccionStyle}>GUARDAR</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        {dias.map(d => <button key={d} onClick={() => setDiaConsulta(d)} style={btnTabStyle(diaConsulta === d)}>{d.toUpperCase()}</button>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div style={cardStyle}>
          <h3 style={{ color: '#00f2ff' }}>Horarios: {diaConsulta}</h3>
          {sesionesVisibles.filter(s => s.dia_semana === diaConsulta).sort((a,b) => a.hora.localeCompare(b.hora)).map(s => (
            <div key={s.id} style={filaStyle}>
              {editId === s.id ? (
                <div style={{ display: 'flex', gap: '5px', width: '100%', flexWrap: 'wrap' }}>
                  <select style={inputStyle} defaultValue={s.dia_semana} onChange={(e) => setEditData({...editData, dia_semana: e.target.value})}>{dias.map(d => <option key={d} value={d}>{d}</option>)}</select>
                  <input style={inputStyle} defaultValue={s.hora} onChange={(e) => setEditData({...editData, hora: e.target.value})} />
                  <input style={inputStyle} defaultValue={s.paciente_nombre} onChange={(e) => setEditData({...editData, paciente_nombre: e.target.value})} />
                  <button onClick={() => guardarEdicion(s.id)} style={btnAccionStyle}>💾</button>
                </div>
              ) : (
                <>
                  <span style={{ color: '#00f2ff', fontWeight: 'bold', width: '80px' }}>{s.hora}</span>
                  <span style={{ flexGrow: 1 }}>{s.paciente_nombre} <small style={{ color: '#888' }}>({users.find(u => u.id === s.profesional_id)?.nombre})</small></span>
                  {esAdminOdireccion && (
                    <>
                      <button onClick={() => { setEditId(s.id); setEditData(s); }} style={{background:'transparent', border:'none', cursor:'pointer', fontSize:'1.2rem'}}>✏️</button>
                      <button onClick={() => eliminarSesion(s.id)} style={{background:'transparent', border:'none', cursor:'pointer', fontSize:'1.2rem'}}>🗑️</button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        <div style={cardStyle}>
          <h3 style={{ color: '#00f2ff' }}>Auditoría</h3>
          <input style={{...inputStyle, width: '100%', marginBottom: '10px'}} placeholder="🔎 Buscar paciente..." onChange={(e) => setFiltroPaciente(e.target.value)} />
          <select style={{...inputStyle, width: '100%'}} onChange={(e) => setPacienteConsultaId(e.target.value)} size={5}>
            {pacientesFiltrados.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          {sesionesVisibles.filter(s => s.paciente_id === pacienteConsultaId).map(s => (
            <div key={s.id} style={{ padding: '10px', background: '#1a1a1a', borderRadius: '8px', marginTop: '10px' }}>{s.dia_semana} | {s.hora} hs | {s.tipo_prestacion}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

const cardStyle = { background: '#0a0a0a', border: '1px solid #333', borderRadius: '15px', padding: '20px', marginBottom: '20px' };
const inputStyle = { background: '#000', border: '1px solid #444', color: '#fff', padding: '8px', borderRadius: '8px' };
const btnAccionStyle = { background: '#00f2ff', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', padding: '8px' };
const filaStyle = { padding: '12px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center' };
const btnTabStyle = (activo) => ({ padding: '10px 20px', borderRadius: '8px', border: activo ? '1px solid #00f2ff' : '1px solid #333', background: activo ? '#00f2ff' : 'transparent', color: activo ? '#000' : '#fff', cursor: 'pointer', fontWeight: 'bold' });

export default AgendaFija;