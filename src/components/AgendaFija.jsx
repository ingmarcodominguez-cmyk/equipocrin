import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function AgendaFija({ userData }) {
  const [sesiones, setSesiones] = useState([])
  const [pacientes, setPacientes] = useState([])
  const [users, setUsers] = useState([])
  
  const [vistaActiva, setVistaActiva] = useState('agenda') 
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

  const puedeEditar = (s) => esAdminOdireccion || String(s.profesional_id) === String(userData.id);

  async function guardarSesion() {
    if (editId) {
      const s = sesiones.find(s => s.id === editId);
      if (!puedeEditar(s)) { alert("No tenés permiso para editar esta sesión."); return; }
    }
    
    const horaFinal = horarioManual.trim() !== '' ? horarioManual : hora;
    const p = pacientes.find(p => String(p.id) === String(pacienteSeleccionado));
    const payload = { paciente_id: pacienteSeleccionado, paciente_nombre: p?.nombre || 'Desconocido', profesional_id: prestadorSeleccionado, dia_semana: dia, hora: horaFinal, asistencia: 'Pendiente' };
    
    if (editId) { await supabase.from('sesiones_fijas').update(payload).eq('id', editId); setEditId(null); } 
    else { await supabase.from('sesiones_fijas').insert([payload]); }
    
    await cargarDatos(); alert('Sesión guardada');
  }

  async function eliminarSesion(id) {
    const s = sesiones.find(s => s.id === id);
    if (!puedeEditar(s)) { alert("No tenés permiso para borrar esta sesión."); return; }
    
    if (window.confirm("¿Estás seguro de eliminar esta sesión fija?")) {
      await supabase.from('sesiones_fijas').delete().eq('id', id);
      await cargarDatos();
    }
  }

  function iniciarEdicion(s) {
    if (!puedeEditar(s)) { alert("Solo podés editar tus propias sesiones."); return; }
    setEditId(s.id); setDia(s.dia_semana); setHora(s.hora); setHorarioManual('');
    setPacienteSeleccionado(String(s.paciente_id)); setPrestadorSeleccionado(String(s.profesional_id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const sesionesVisibles = profesionalFiltroId ? sesiones.filter(s => s.profesional_id === profesionalFiltroId) : sesiones;
  const horasDelDia = sesionesVisibles.filter(s => s.dia_semana === diaConsulta).sort((a,b) => a.hora.localeCompare(b.hora));
  const pacientesFiltrados = pacientes.filter(p => p.nombre.toLowerCase().includes(filtroPaciente.toLowerCase()));

  return (
    <div style={{ color: '#fff', padding: '20px', maxWidth: '1200px', margin: 'auto' }}>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => setVistaActiva('agenda')} style={btnTabStyle(vistaActiva === 'agenda')}>📅 Agenda</button>
        <button onClick={() => setVistaActiva('auditoria')} style={btnTabStyle(vistaActiva === 'auditoria')}>🔎 Por Paciente</button>
      </div>

      {vistaActiva === 'agenda' ? (
        <>
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

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ color: '#00f2ff' }}>📅 Agenda</h2>
              <select style={inputStyle} onChange={(e) => setProfesionalFiltroId(e.target.value)}>
                <option value="">Todos los profesionales</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '10px', flexWrap: 'wrap' }}>
              {dias.map(d => <button key={d} onClick={() => setDiaConsulta(d)} style={btnTabStyle(diaConsulta === d)}>{d.substring(0,3)}</button>)}
            </div>
            <div style={cardStyle}>
              {horasDelDia.map(s => {
                const profesional = users.find(u => String(u.id) === String(s.profesional_id));
                return (
                  <div key={s.id} style={filaStyle}>
                    <span style={{ fontWeight: 'bold', width: '80px' }}>{s.hora}</span>
                    <span style={{ flexGrow: 1 }}>{s.paciente_nombre} <span style={{ color: '#888', fontSize: '0.8rem' }}>({profesional?.nombre})</span></span>
                    {puedeEditar(s) && (
                      <div style={{display: 'flex', gap: '10px'}}>
                        <button onClick={() => iniciarEdicion(s)} style={{background: 'none', border: 'none', cursor: 'pointer'}}>✏️</button>
                        <button onClick={() => eliminarSesion(s.id)} style={{background: 'none', border: 'none', cursor: 'pointer'}}>🗑️</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      ) : (
        <div style={cardStyle}>
          <input style={{...inputStyle, width: '100%'}} placeholder="Buscar paciente..." onChange={(e) => setFiltroPaciente(e.target.value)} />
          <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '10px' }}>
            {pacientesFiltrados.map(p => (
              <div key={p.id} onClick={() => setPacienteConsultaId(p.id)} style={{ padding: '10px', background: p.id === pacienteConsultaId ? '#00f2ff' : 'transparent', color: p.id === pacienteConsultaId ? '#000' : '#fff', cursor: 'pointer' }}>
                {p.nombre}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const cardStyle = { background: '#0a0a0a', border: '1px solid #333', borderRadius: '15px', padding: '20px' };
const inputStyle = { background: '#000', border: '1px solid #444', color: '#fff', padding: '8px', borderRadius: '8px' };
const btnAccionStyle = { background: '#00f2ff', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', padding: '8px' };
const filaStyle = { padding: '10px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center' };
const btnTabStyle = (activo) => ({ padding: '10px 15px', borderRadius: '8px', border: 'none', background: activo ? '#00f2ff' : '#222', color: activo ? '#000' : '#fff', cursor: 'pointer', fontWeight: 'bold' });

export default AgendaFija;