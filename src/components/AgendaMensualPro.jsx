import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function AgendaMensualPro({ userData }) {
  const [turnos, setTurnos] = useState([])
  const [users, setUsers] = useState([])
  const [mesActual, setMesActual] = useState(new Date())
  const [diaSeleccionado, setDiaSeleccionado] = useState(null)
  const [turnoEditando, setTurnoEditando] = useState(null)
  
  const [filtroFecha, setFiltroFecha] = useState(null)
  const [filtroProfesional, setFiltroProfesional] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  
  const [form, setForm] = useState({ 
    paciente_nombre: '', profesional_id: '', prestacion: 'Turno primera vez', 
    hora: '09:00', observaciones: '', estado: 'pendiente', horario_especial: '' 
  })

  const rol = userData?.rol?.toUpperCase() || "";
  const esAdmin = ['ADMINISTRACION', 'DIRECCION', 'PROFESIONAL_PLUS'].includes(rol);

  const generarHorarios = () => {
    const arr = [];
    let horaMa = 9, minMa = 0;
    while (horaMa < 13 || (horaMa === 12 && minMa <= 45)) {
      if (horaMa === 13) break;
      arr.push(`${String(horaMa).padStart(2, '0')}:${String(minMa).padStart(2, '0')}`);
      minMa += 45;
      if (minMa >= 60) { horaMa += 1; minMa -= 60; }
    }
    let horaTa = 14, minTa = 0;
    while (horaTa < 21) {
      arr.push(`${String(horaTa).padStart(2, '0')}:${String(minTa).padStart(2, '0')}`);
      minTa += 45;
      if (minTa >= 60) { horaTa += 1; minTa -= 60; }
    }
    return arr;
  };

  const listaHorarios = generarHorarios();

  useEffect(() => {
    cargarDatos();
    const channel = supabase
      .channel('agenda_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turnos' }, () => {
        cargarDatos();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [mesActual]);

  async function cargarDatos() {
    const { data: t } = await supabase.from('turnos').select('*');
    const { data: u } = await supabase.from('users').select('*');
    if (t) setTurnos(t);
    if (u) setUsers(u);
  }

  async function guardarTurno() {
    const horaSeleccionada = form.horario_especial || form.hora;
    const fechaSeleccionada = `${mesActual.getFullYear()}-${String(mesActual.getMonth() + 1).padStart(2, '0')}-${String(diaSeleccionado).padStart(2, '0')}`;
    
    const existeConflicto = turnos.some(t => {
      const esElMismoTurno = turnoEditando ? String(t.id) === String(turnoEditando.id) : false;
      if (esElMismoTurno) return false;
      const tFecha = new Date(t.fecha_inicio).toISOString().split('T')[0];
      const tHora = t.observaciones?.split(']')[0]?.replace('[', '');
      return String(t.profesional_id) === String(form.profesional_id) && 
             tFecha === fechaSeleccionada && 
             tHora === horaSeleccionada;
    });

    if (existeConflicto) {
      alert("¡Cuidado! El profesional ya tiene OTRO turno asignado en ese horario.");
      return; 
    }

    const fechaISO = `${fechaSeleccionada}T${horaSeleccionada}:00`;
    const profesionalObj = users.find(u => String(u.id) === String(form.profesional_id));
    const nombreProf = profesionalObj ? profesionalObj.nombre : 'Sin Prof.';
    const obsEmpaquetadas = `[${horaSeleccionada}] [${form.prestacion}] [${nombreProf}] ${form.observaciones}`;
    const payload = { paciente_nombre: form.paciente_nombre, profesional_id: form.profesional_id, fecha_inicio: fechaISO, observaciones: obsEmpaquetadas, estado: form.estado };

    if (turnoEditando) {
      await supabase.from('turnos').update(payload).eq('id', turnoEditando.id);
    } else {
      await supabase.from('turnos').insert([payload]);
    }
    setDiaSeleccionado(null); setTurnoEditando(null);
  }

  async function eliminarTurno() {
    if (!turnoEditando) return;
    if (window.confirm("¿Estás seguro de que quieres eliminar este turno definitivamente?")) {
      await supabase.from('turnos').delete().eq('id', turnoEditando.id);
      setDiaSeleccionado(null);
      setTurnoEditando(null);
    }
  }

  let turnosVisibles = esAdmin ? turnos : turnos.filter(t => String(t.profesional_id || '').trim() === String(userData?.id || '').trim());
  if (filtroProfesional) turnosVisibles = turnosVisibles.filter(t => String(t.profesional_id) === String(filtroProfesional));
  if (filtroEstado) turnosVisibles = turnosVisibles.filter(t => t.estado === filtroEstado);

  const prestaciones = ['Turno primera vez', 'Evaluacion', 'Reunion', 'Entrenamiento', 'Devolucion','Visita A Instituciones'];
  const diasEnMes = new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 0).getDate();
  const offset = (new Date(mesActual.getFullYear(), mesActual.getMonth(), 1).getDay() + 6) % 7;

  return (
    <div style={{ padding: '0', backgroundColor: '#ffffff', color: '#000000', fontSize: '14px', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', margin: '20px auto', width: '95%', maxWidth: '900px', flexWrap: 'wrap' }}>
        <button onClick={() => {setFiltroFecha(null); setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1))}}>←</button>
        <h2 style={{ fontSize: '18px', margin: 0, alignSelf: 'center' }}>{mesActual.toLocaleString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase()}</h2>
        <button onClick={() => {setFiltroFecha(null); setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1))}}>→</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <select value={filtroProfesional} onChange={e => setFiltroProfesional(e.target.value)} style={{padding: '5px'}}>
            <option value="">Todos los Profesionales</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <label style={{ fontSize: '10px', color: '#666', marginBottom: '2px', fontWeight: 'bold' }}>FECHA</label>
            <input 
              type="date" 
              onChange={e => { 
                if(e.target.value) {
                  const f = new Date(e.target.value);
                  setFiltroFecha(f.getUTCDate());
                  setMesActual(new Date(f.getFullYear(), f.getMonth(), 1));
                } else {
                  setFiltroFecha(null);
                }
              }} 
              style={{padding: '5px'}} 
            />
          </div>
        </div>
        
        {filtroFecha && (
          <button onClick={() => setFiltroFecha(null)} style={{ padding: '5px 10px', fontSize: '12px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            LIMPIAR FECHA
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', backgroundColor: '#ffffff', borderTop: '1px solid #ddd', flex: 1, width: '100%' }}>
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
          <div key={d} style={{ textAlign: 'center', background: '#f8f9fa', padding: '10px', fontWeight: 'bold', borderRight: '1px solid #ddd', borderBottom: '1px solid #ddd' }}>{d}</div>
        ))}
        {[...Array(offset)].map((_, i) => <div key={`off-${i}`} style={{ background: '#fcfcfc', minHeight: '100px', borderRight: '1px solid #ddd', borderBottom: '1px solid #ddd' }} />)}
        {[...Array(diasEnMes)].map((_, i) => {
          const dN = i + 1;
          if (filtroFecha && dN !== filtroFecha) {
             return <div key={i} style={{ background: '#f9f9f9', borderRight: '1px solid #ddd', borderBottom: '1px solid #ddd' }} />;
          }

          const tD = (turnosVisibles || []).filter(t => {
            const f = new Date(t.fecha_inicio);
            return f.getUTCDate() === dN && f.getUTCMonth() === mesActual.getMonth() && f.getUTCFullYear() === mesActual.getFullYear();
          });
          return (
            <div key={i} style={{ minHeight: '100px', background: '#ffffff', padding: '5px', borderRight: '1px solid #ddd', borderBottom: '1px solid #ddd', position: 'relative' }}>
              <div onClick={() => { setDiaSeleccionado(dN); setTurnoEditando(null); setForm({...form, paciente_nombre: '', estado: 'pendiente', horario_especial: ''}); }} style={{ cursor: 'pointer', color: '#007bff', fontWeight: 'bold' }}>{dN} +</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {tD.sort((a,b) => (a.observaciones?.split(']')[0] || '').localeCompare(b.observaciones?.split(']')[0] || '')).map(t => {
                  const parts = t.observaciones?.split(']') || [];
                  const hora = parts[0]?.replace('[', '') || '--:--';
                  const prest = parts[1]?.replace('[', '') || '';
                  const prof = parts[2]?.replace('[', '') || 'N/A';
                  return (
                    <div key={t.id} onClick={(e) => { e.stopPropagation(); setTurnoEditando(t); setForm({...t, hora: hora, prestacion: prest}); setDiaSeleccionado(dN); }} style={{ fontSize: '11px', background: t.estado === 'realizado' ? '#d4edda' : t.estado === 'cancelado' ? '#f8d7da' : '#eefaff', padding: '4px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #ddd' }}>
                      <div style={{ color: '#0056b3', fontWeight: 'bold', fontSize: '12px' }}>{t.paciente_nombre.toUpperCase()}</div>
                      <div><strong>{hora}</strong> | {prest} | <b>{prof}</b></div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {diaSeleccionado && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', padding: '20px', width: '320px', borderRadius: '15px' }}>
            <h3>{turnoEditando ? 'Editar Turno' : 'Nuevo Turno'}</h3>
            <input placeholder="Paciente" value={form.paciente_nombre} onChange={e => setForm({...form, paciente_nombre: e.target.value})} style={{width: '100%', marginBottom: 10, padding: '8px'}} />
            <select value={form.prestacion} onChange={e => setForm({...form, prestacion: e.target.value})} style={{width: '100%', marginBottom: 10, padding: '8px'}}>{prestaciones.map(p => <option key={p} value={p}>{p}</option>)}</select>
            <select value={form.profesional_id} onChange={e => setForm({...form, profesional_id: e.target.value})} style={{width: '100%', marginBottom: 10, padding: '8px'}}><option value="">Profesional...</option>{users.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
            <input placeholder="Ej: 13:15" value={form.horario_especial} onChange={e => setForm({...form, horario_especial: e.target.value})} style={{width: '100%', marginBottom: 10, padding: '8px'}} />
            <select value={form.hora} onChange={e => setForm({...form, hora: e.target.value})} style={{width: '100%', marginBottom: 10, padding: '8px'}}>{listaHorarios.map(h => <option key={h} value={h}>{h}</option>)}</select>
            <select value={form.estado} onChange={e => setForm({...form, estado: e.target.value})} style={{width: '100%', marginBottom: 10, padding: '8px'}}><option value="pendiente">⏳ Pendiente</option><option value="realizado">✅ Realizado</option><option value="cancelado">❌ Cancelado</option></select>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={guardarTurno} style={{flex: 1, padding: '10px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '5px'}}>GUARDAR</button>
                <button onClick={() => setDiaSeleccionado(null)} style={{flex: 1, padding: '10px', background: '#ccc', border: 'none', borderRadius: '5px'}}>CERRAR</button>
              </div>
              {turnoEditando && (
                <button onClick={eliminarTurno} style={{padding: '10px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '5px'}}>ELIMINAR TURNO</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AgendaMensualPro;