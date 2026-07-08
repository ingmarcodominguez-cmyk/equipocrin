import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function GestionPacientes() {
  const [aviso, setAviso] = useState(false);
  const [pacientes, setPacientes] = useState([])
  const [editId, setEditId] = useState(null)
  const [busqueda, setBusqueda] = useState(''); 
  
  // Nuevo estado para el modal
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);

  const [dia, setDia] = useState('');
  const [mes, setMes] = useState('');
  const [anio, setAnio] = useState('');

  const [form, setForm] = useState({
    nombre: '', dni: '', domicilio: '', 
    escuela: '', telefono: '', obra_social: '', diagnostico: ''
  })

  useEffect(() => {
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      setAviso(true);
      setTimeout(() => setAviso(false), 3000);
      window.history.pushState(null, "", window.location.href);
    };
    window.addEventListener('popstate', handlePopState);
    cargarPacientes();
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  async function cargarPacientes() {
    const { data } = await supabase.from('pacientes').select('*').order('nombre', { ascending: true });
    if (data) setPacientes(data);
  }

  const pacientesFiltrados = busqueda.trim() === '' 
    ? [] 
    : pacientes.filter(p => 
        (p.nombre && p.nombre.toLowerCase().includes(busqueda.toLowerCase())) || 
        (p.dni && p.dni.includes(busqueda))
      );

  const calcularEdad = (fecha) => {
    if (!fecha) return 0;
    const hoy = new Date();
    const nacimiento = new Date(fecha);
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const m = hoy.getMonth() - nacimiento.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
    return edad;
  };

  function iniciarEdicion(p) {
    setEditId(p.id);
    setForm({
      nombre: p.nombre, dni: p.dni, domicilio: p.domicilio, 
      escuela: p.escuela, telefono: p.telefono, obra_social: p.obra_social, diagnostico: p.diagnostico
    });
    if (p.fecha_nacimiento) {
      const [y, m, d] = p.fecha_nacimiento.split('-');
      setAnio(y); setMes(m); setDia(d);
    }
    setPacienteSeleccionado(null); // Cerrar modal al editar
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function guardarPaciente() {
    if (!form.nombre || !form.dni || !dia || !mes || !anio) return alert("Nombre, DNI y Fecha de nacimiento son obligatorios");

    const fecha_nacimiento = `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    const edad = calcularEdad(fecha_nacimiento);
    const payload = { ...form, fecha_nacimiento, edad };

    if (editId) {
      const { error } = await supabase.from('pacientes').update(payload).eq('id', editId);
      if (error) return alert("Error: " + error.message);
    } else {
      const { error } = await supabase.from('pacientes').insert([payload]);
      if (error) return alert("Error: " + error.message);
    }

    setForm({ nombre: '', dni: '', domicilio: '', escuela: '', telefono: '', obra_social: '', diagnostico: '' });
    setDia(''); setMes(''); setAnio('');
    setEditId(null);
    cargarPacientes();
  }

  return (
    <div style={{ color: '#fff', padding: '20px', position: 'relative' }}>
      {aviso && (
        <div style={{ position: 'fixed', top: '20px', left: '10%', right: '10%', background: '#ff0055', color: '#fff', padding: '15px', borderRadius: '10px', textAlign: 'center', zIndex: 1000, fontWeight: 'bold' }}>
          ¡Por favor, utiliza el botón 'Volver' de la pantalla!
        </div>
      )}

      <h2 style={{ color: '#00f2ff' }}>{editId ? '✏️ Editando Paciente' : '➕ Cargar nuevo paciente'}</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px', background: '#1a1a1a', padding: '20px', borderRadius: '10px' }}>
        <input placeholder="Nombre Completo" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} style={inputStyle} />
        <input placeholder="DNI" value={form.dni} onChange={e => setForm({...form, dni: e.target.value})} style={inputStyle} />
        
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          <input type="number" placeholder="Día" value={dia} onChange={e => setDia(e.target.value)} style={{...inputStyle, width: '30%'}} />
          <input type="number" placeholder="Mes" value={mes} onChange={e => setMes(e.target.value)} style={{...inputStyle, width: '30%'}} />
          <input type="number" placeholder="Año" value={anio} onChange={e => setAnio(e.target.value)} style={{...inputStyle, width: '40%'}} />
        </div>

        <input placeholder="Domicilio" value={form.domicilio} onChange={e => setForm({...form, domicilio: e.target.value})} style={inputStyle} />
        <input placeholder="Escuela" value={form.escuela} onChange={e => setForm({...form, escuela: e.target.value})} style={inputStyle} />
        <input placeholder="Teléfono" value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})} style={inputStyle} />
        <input placeholder="Obra Social" value={form.obra_social} onChange={e => setForm({...form, obra_social: e.target.value})} style={inputStyle} />
        <input placeholder="Diagnóstico" value={form.diagnostico} onChange={e => setForm({...form, diagnostico: e.target.value})} style={inputStyle} />
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={guardarPaciente} style={btnStyle}>{editId ? 'ACTUALIZAR DATOS' : 'GUARDAR PACIENTE'}</button>
        {editId && <button onClick={() => { setEditId(null); setForm({nombre: '', dni: '', domicilio: '', escuela: '', telefono: '', obra_social: '', diagnostico: ''}); setDia(''); setMes(''); setAnio(''); }} style={{...btnStyle, borderColor: '#666', color: '#ccc'}}>CANCELAR</button>}
      </div>

      <h3 style={{ marginTop: '30px', color: '#00f2ff' }}>Buscador de Pacientes</h3>
      <input 
        placeholder="🔍 Escriba un nombre o DNI para empezar a buscar..." 
        value={busqueda} 
        onChange={e => setBusqueda(e.target.value)} 
        style={{...inputStyle, width: '100%', marginBottom: '15px', borderColor: '#00f2ff'}} 
      />

      {busqueda.trim() !== '' && (
        <div style={{ width: '100%', marginTop: '20px' }}>
          {pacientesFiltrados.map(p => (
            <div key={p.id} onClick={() => setPacienteSeleccionado(p)} style={cardStyle}>
              <div style={{ fontWeight: 'bold', color: '#00f2ff' }}>{p.nombre}</div>
              <div style={{ fontSize: '0.8rem' }}>DNI: {p.dni}</div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Ficha Vertical */}
      {pacienteSeleccionado && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h2 style={{ color: '#00f2ff', marginTop: 0 }}>Ficha del Paciente</h2>
            <div style={{ textAlign: 'left', lineHeight: '1.8' }}>
              <p><strong>Nombre:</strong> {pacienteSeleccionado.nombre}</p>
              <p><strong>DNI:</strong> {pacienteSeleccionado.dni}</p>
              <p><strong>Edad:</strong> {pacienteSeleccionado.edad}</p>
              <p><strong>Fecha Nac:</strong> {pacienteSeleccionado.fecha_nacimiento}</p>
              <p><strong>Teléfono:</strong> {pacienteSeleccionado.telefono}</p>
              <p><strong>Escuela:</strong> {pacienteSeleccionado.escuela}</p>
              <p><strong>Obra Social:</strong> {pacienteSeleccionado.obra_social}</p>
              <p><strong>Diagnóstico:</strong> {pacienteSeleccionado.diagnostico}</p>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => iniciarEdicion(pacienteSeleccionado)} style={btnStyle}>EDITAR</button>
              <button onClick={() => setPacienteSeleccionado(null)} style={{...btnStyle, borderColor: '#666', color: '#ccc'}}>CERRAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle = { padding: '12px', borderRadius: '8px', border: '1px solid #444', background: '#000', color: '#fff', boxSizing: 'border-box' };
const btnStyle = { padding: '15px', background: 'transparent', border: '1px solid #00f2ff', color: '#00f2ff', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };
const cardStyle = { background: '#1a1a1a', padding: '15px', borderRadius: '8px', marginBottom: '10px', border: '1px solid #333', cursor: 'pointer' };

const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' };
const modalStyle = { background: '#1a1a1a', padding: '25px', borderRadius: '15px', width: '100%', maxWidth: '400px', color: '#fff', border: '1px solid #00f2ff', maxHeight: '90vh', overflowY: 'auto' };

export default GestionPacientes;