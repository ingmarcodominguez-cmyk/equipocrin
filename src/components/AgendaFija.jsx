import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

function AgendaFija({ userData }) {
  const [sesiones, setSesiones] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [users, setUsers] = useState([]);
  const [guardando, setGuardando] = useState(false);
  
  // Estados de UI
  const [vistaActiva, setVistaActiva] = useState('agenda'); 
  const [modalEdicionAbierto, setModalEdicionAbierto] = useState(false);
  
  // Estados de formulario
  const [dia, setDia] = useState('Lunes');
  const [hora, setHora] = useState('09:00');
  const [horarioManual, setHorarioManual] = useState('');
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState('');
  const [prestadorSeleccionado, setPrestadorSeleccionado] = useState('');
  const [editId, setEditId] = useState(null);
  
  // Filtros
  const [diaConsulta, setDiaConsulta] = useState('Lunes'); 
  const [profesionalFiltroId, setProfesionalFiltroId] = useState(''); 
  const [filtroPacienteAgenda, setFiltroPacienteAgenda] = useState(''); // Nuevo filtro en Agenda
  const [pacienteConsultaId, setPacienteConsultaId] = useState(''); 
  const [filtroPaciente, setFiltroPaciente] = useState(''); // Filtro en Auditoría

  const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  const rol = userData?.rol?.toUpperCase();
  const esAdminOdireccion = rol === 'ADMINISTRACION' || rol === 'DIRECCION';

  const esMarinaOlivera = (id, nombre) => {
    const idStr = String(id || '').trim();
    if (idStr === '692dc3c6-7a77-4862-bee3-28e700aac08b' || idStr === 'e12e12e1-1212-1212-1212-121212121212') return true;
    const n = (nombre || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return n.includes('MARINA') && n.includes('OLIVERA');
  };

  const getMarinaIds = () => {
    const ids = ['692dc3c6-7a77-4862-bee3-28e700aac08b', 'e12e12e1-1212-1212-1212-121212121212'];
    (users || []).forEach(u => {
      if (esMarinaOlivera(u.id, u.nombre) && !ids.includes(String(u.id))) {
        ids.push(String(u.id));
      }
    });
    return ids;
  };

  useEffect(() => { 
    cargarDatos();
  }, []);

  useEffect(() => {
    if (!esAdminOdireccion && userData?.id) {
      setProfesionalFiltroId(String(userData.id));
      if (!prestadorSeleccionado) {
        setPrestadorSeleccionado(String(userData.id));
      }
    }
  }, [userData?.id, esAdminOdireccion]);

  const idToUuid = (id) => '00000000-0000-0000-0000-' + String(id).padStart(12, '0');

  async function cargarDatos() {
    const { data: sData } = await supabase.from('sesiones_fijas').select('*');
    const { data: pData } = await supabase.from('pacientes_motor').select('id_paciente, nombre_apellido, dni').order('nombre_apellido', { ascending: true });
    const { data: uData } = await supabase.from('users').select('*').order('nombre', { ascending: true });
    const mappedPacientes = (pData || []).map(p => ({
      id: idToUuid(p.id_paciente),
      id_paciente: p.id_paciente,
      nombre: p.nombre_apellido,
      dni: p.dni
    }));
    setSesiones(sData || []); setPacientes(mappedPacientes); setUsers(uData || []);
  }

  async function recargarPacientes() {
    const { data: pData } = await supabase.from('pacientes_motor').select('id_paciente, nombre_apellido, dni').order('nombre_apellido', { ascending: true });
    if (pData) {
      setPacientes(pData.map(p => ({
        id: idToUuid(p.id_paciente),
        id_paciente: p.id_paciente,
        nombre: p.nombre_apellido,
        dni: p.dni
      })));
    }
  }

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

  const puedeEditar = (s) => {
    if (esAdminOdireccion) return true;
    const sProfId = String(s.profesional_id || '').trim();
    if (sProfId === String(userData?.id || '').trim()) return true;
    if (esMarinaOlivera(userData?.id, userData?.nombre)) {
      const marinaIds = getMarinaIds();
      if (marinaIds.includes(sProfId)) return true;
    }
    return false;
  };

  async function guardarSesion() {
    const p = pacientes.find(p => String(p.id) === String(pacienteSeleccionado));
    if (!p) { alert("Error: Seleccioná un paciente válido."); return; }
    
    setGuardando(true);
    const payload = { 
      paciente_id: p.id, 
      paciente_nombre: p.nombre, 
      profesional_id: prestadorSeleccionado, 
      dia_semana: dia, 
      hora: horarioManual.trim() !== '' ? horarioManual : hora, 
      asistencia: 'Pendiente' 
    };
    
    try {
      if (editId) {
        await supabase.from('sesiones_fijas').update(payload).eq('id', editId);
        setSesiones(prev => prev.map(s => s.id === editId ? { ...s, ...payload } : s));
        setEditId(null);
      } else {
        const { data } = await supabase.from('sesiones_fijas').insert([payload]).select();
        if (data) setSesiones(prev => [...prev, ...data]);
      }
      setModalEdicionAbierto(false);
      alert('✅ Sesión guardada');
    } catch (e) { alert("Error: " + e.message); }
    setGuardando(false);
  }

  async function eliminarSesion(id) {
    if (window.confirm("¿Seguro de eliminar?")) {
      await supabase.from('sesiones_fijas').delete().eq('id', id);
      setSesiones(prev => prev.filter(s => s.id !== id));
    }
  }

  function iniciarEdicion(s) {
    setEditId(s.id); setDia(s.dia_semana); setHora(s.hora); setHorarioManual('');
    setPacienteSeleccionado(String(s.paciente_id)); setPrestadorSeleccionado(String(s.profesional_id));
  }

  const marinaIds = getMarinaIds();
  const usuarioEsMarina = esMarinaOlivera(userData?.id, userData?.nombre);
  const filtroEsMarina = marinaIds.includes(String(profesionalFiltroId || '').trim());

  // Lógica de filtrado avanzada para Agenda
  const sesionesVisibles = sesiones.filter(s => {
    const sProfId = String(s.profesional_id || '').trim();

    let coincideProfesional = true;
    if (usuarioEsMarina) {
      // Si Marina está logueada: si no tiene filtro manual o si seleccionó Marina (directa o por sesión), ve ambas cuentas
      if (!profesionalFiltroId || filtroEsMarina) {
        coincideProfesional = marinaIds.includes(sProfId);
      } else {
        coincideProfesional = sProfId === String(profesionalFiltroId).trim();
      }
    } else if (filtroEsMarina) {
      // Si un administrador u otro usuario selecciona Marina (o Marina Por Sesión), ve ambas cuentas juntas
      coincideProfesional = marinaIds.includes(sProfId);
    } else if (profesionalFiltroId !== '') {
      coincideProfesional = sProfId === String(profesionalFiltroId).trim();
    } else if (!esAdminOdireccion && userData?.id) {
      coincideProfesional = sProfId === String(userData.id).trim();
    }

    const coincidePaciente = filtroPacienteAgenda === '' || (s.paciente_nombre || '').toLowerCase().includes(filtroPacienteAgenda.toLowerCase());
    return coincideProfesional && coincidePaciente && s.dia_semana === diaConsulta;
  }).sort((a,b) => a.hora.localeCompare(b.hora));

  const pacientesFiltrados = pacientes.filter(p => p.nombre?.toLowerCase().includes(filtroPaciente.toLowerCase().trim()));

  return (
    <div style={{ color: '#fff', padding: '20px', maxWidth: '800px', margin: 'auto' }}>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => setVistaActiva('agenda')} style={btnTabStyle(vistaActiva === 'agenda')}>📅 Agenda</button>
        <button onClick={() => setVistaActiva('auditoria')} style={btnTabStyle(vistaActiva === 'auditoria')}>🔎 Por Paciente</button>
      </div>

      {vistaActiva === 'agenda' ? (
        <>
          <div style={cardStyle}>
            <h3>{editId ? '✏️ Editar Sesión' : '➕ Nueva Sesión'}</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <select style={inputStyle} value={dia} onChange={(e) => setDia(e.target.value)}>{dias.map(d => <option key={d} value={d}>{d}</option>)}</select>
              <select style={inputStyle} value={hora} onChange={(e) => { setHora(e.target.value); setHorarioManual(''); }}>{generarHorarios().map(h => <option key={h} value={h}>{h}</option>)}</select>
              <select style={inputStyle} value={pacienteSeleccionado} onChange={(e) => setPacienteSeleccionado(e.target.value)} onFocus={recargarPacientes}><option value="">Paciente...</option>{pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
              <select style={inputStyle} value={prestadorSeleccionado} onChange={(e) => setPrestadorSeleccionado(e.target.value)}><option value="">Profesional...</option>{users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
              <button disabled={guardando} onClick={guardarSesion} style={btnAccionStyle}>{guardando ? '...' : (editId ? 'ACTUALIZAR' : 'GUARDAR')}</button>
            </div>
          </div>
          
          <div style={{ marginTop: '20px' }}>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
               <select 
                 style={inputStyle} 
                 value={profesionalFiltroId} 
                 onChange={(e) => setProfesionalFiltroId(e.target.value)}
               >
                  <option value="">{esAdminOdireccion ? "Todos los prof." : (usuarioEsMarina ? "Ver mi agenda completa (Directa + Por Sesión)" : "Ver mi agenda")}</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
               </select>
               <input style={inputStyle} placeholder="Filtrar por paciente..." onChange={(e) => setFiltroPacienteAgenda(e.target.value)} />
             </div>
             
             <div style={{ display: 'flex', gap: '5px', margin: '10px 0' }}>
                {dias.map(d => <button key={d} onClick={() => setDiaConsulta(d)} style={btnTabStyle(diaConsulta === d)}>{d.substring(0,3)}</button>)}
             </div>
             {sesionesVisibles.map(s => {
               const prof = users.find(u => String(u.id) === String(s.profesional_id));
               return (
                 <div key={s.id} style={filaStyle}>
                   <span style={{ fontWeight: 'bold', width: '80px' }}>{s.hora}</span>
                   <span style={{ flexGrow: 1 }}>{s.paciente_nombre} <span style={{color: '#888', fontSize: '0.9rem'}}>({prof?.nombre || 'Sin prof'})</span></span>
                   {puedeEditar(s) && (
                     <div style={{display: 'flex', gap: '10px'}}>
                       <button onClick={() => {iniciarEdicion(s); setModalEdicionAbierto(true);}} style={{background:'none', border:'none', cursor:'pointer'}}>✏️</button>
                       <button onClick={() => eliminarSesion(s.id)} style={{background:'none', border:'none', cursor:'pointer'}}>🗑️</button>
                     </div>
                   )}
                 </div>
               );
             })}
          </div>
        </>
      ) : (
        <div style={cardStyle}>
          <input style={{...inputStyle, width: '100%'}} placeholder="Buscar paciente..." onChange={(e) => setFiltroPaciente(e.target.value)} onFocus={recargarPacientes} />
          <div style={{ maxHeight: '150px', overflowY: 'auto', margin: '10px 0' }}>
            {pacientesFiltrados.map(p => (
              <div key={p.id} onClick={() => setPacienteConsultaId(p.id)} style={{ padding: '10px', background: p.id === pacienteConsultaId ? '#00f2ff' : 'transparent', color: p.id === pacienteConsultaId ? '#000' : '#fff', cursor: 'pointer' }}>{p.nombre}</div>
            ))}
          </div>
          {pacienteConsultaId && dias.map(dia => {
            const turnos = sesiones.filter(s => s.paciente_id == pacienteConsultaId && s.dia_semana === dia).sort((a,b) => a.hora.localeCompare(b.hora));
            if (turnos.length === 0) return null;
            return (
              <div key={dia} style={{ borderTop: '1px solid #333', marginTop: '10px' }}>
                <h4 style={{ color: '#00f2ff' }}>{dia}</h4>
                {turnos.map(s => {
                  const prof = users.find(u => String(u.id) === String(s.profesional_id));
                  return (
                    <div key={s.id} style={{...filaStyle, justifyContent: 'space-between'}}>
                      <span>{s.hora} - {s.paciente_nombre} <span style={{color: '#888', fontSize: '0.9rem'}}>({prof?.nombre || 'Sin prof'})</span></span>
                      {puedeEditar(s) && <button onClick={() => {iniciarEdicion(s); setModalEdicionAbierto(true);}} style={{background:'none', border:'none', cursor:'pointer'}}>✏️</button>}
                    </div>
                  );
                })}
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL DE EDICIÓN */}
      {modalEdicionAbierto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{...cardStyle, width: '90%', maxWidth: '400px'}}>
            <h3>✏️ Editar Turno</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <select style={inputStyle} value={dia} onChange={(e) => setDia(e.target.value)}>{dias.map(d => <option key={d} value={d}>{d}</option>)}</select>
              <input style={inputStyle} value={hora} onChange={(e) => setHora(e.target.value)} />
              <select style={inputStyle} value={prestadorSeleccionado} onChange={(e) => setPrestadorSeleccionado(e.target.value)}>{users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
              <button onClick={guardarSesion} style={btnAccionStyle}>GUARDAR</button>
              <button onClick={() => { setModalEdicionAbierto(false); setEditId(null); }} style={{...btnAccionStyle, background: '#444'}}>CERRAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const cardStyle = { background: '#0a0a0a', border: '1px solid #333', borderRadius: '15px', padding: '20px' };
const inputStyle = { background: '#000', border: '1px solid #444', color: '#fff', padding: '10px', borderRadius: '8px' };
const btnAccionStyle = { background: '#00f2ff', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', padding: '10px', fontWeight: 'bold' };
const filaStyle = { padding: '10px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center' };
const btnTabStyle = (activo) => ({ padding: '10px', borderRadius: '8px', border: 'none', background: activo ? '#00f2ff' : '#222', color: activo ? '#000' : '#fff', cursor: 'pointer', fontWeight: 'bold' });

export default AgendaFija;