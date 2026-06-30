import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

function EstadosCuenta() {
  const [datos, setDatos] = useState([]);
  const [maximo, setMaximo] = useState(30); 
  const [busqueda, setBusqueda] = useState('');
  
  // Estados para el Modal de detalle
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [detalleDeuda, setDetalleDeuda] = useState([]);

  useEffect(() => {
    async function fetchData() {
      const { data, error } = await supabase.from('data_gerencial').select('*');
      if (error) console.error("Error al obtener datos:", error);
      else setDatos(data || []);
    }
    fetchData();
  }, []);

  // Función para abrir el modal
  const verDetalle = async (paciente) => {
    const { data, error } = await supabase
      .from('vista_detalle_deuda_paciente')
      .select('*')
      .eq('id_paciente_excel', paciente.ID_PACIENTE);

    if (error) console.error("Error detalle:", error);
    else {
      setDetalleDeuda(data || []);
      setPacienteSeleccionado(paciente);
    }
  };

  const datosFiltrados = useMemo(() => {
    return datos.filter(p => p.PACIENTE?.toLowerCase().includes(busqueda.toLowerCase()));
  }, [datos, busqueda]);

  const totales = useMemo(() => {
    return datosFiltrados.reduce((acc, p) => ({
      vencido: acc.vencido + (p.VENCIDO || 0),
      prox7: acc.prox7 + (p.PROX_7 || 0),
      prox15: acc.prox15 + (p.PROX_15 || 0),
      prox30: acc.prox30 + (p.PROX_30 || 0),
      total: acc.total + ((p.VENCIDO || 0) + (maximo >= 7 ? (p.PROX_7 || 0) : 0) + (maximo >= 15 ? (p.PROX_15 || 0) : 0) + (maximo >= 30 ? (p.PROX_30 || 0) : 0))
    }), { vencido: 0, prox7: 0, prox15: 0, prox30: 0, total: 0 });
  }, [datosFiltrados, maximo]);

  const calcularTotalFila = (p) => (p.VENCIDO || 0) + (maximo >= 7 ? (p.PROX_7 || 0) : 0) + (maximo >= 15 ? (p.PROX_15 || 0) : 0) + (maximo >= 30 ? (p.PROX_30 || 0) : 0);

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial', color: 'white' }}>
      <h1>Cuenta Corriente</h1>
      
      {/* Tu buscador y botones de rango intactos */}
      <div style={{ marginBottom: '20px' }}>
        <input list="listaPacientes" placeholder="Elegir o buscar paciente..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ padding: '10px', width: '300px', color: 'black' }} />
        <datalist id="listaPacientes">{datos.map((p) => <option key={p.ID_PACIENTE} value={p.PACIENTE} />)}</datalist>
        <button onClick={() => setBusqueda('')} style={{marginLeft: '10px', padding: '10px', cursor: 'pointer'}}>Limpiar</button>
      </div>

      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <button onClick={() => setMaximo(0)} style={{cursor: 'pointer'}}>Vencido</button>
        <button onClick={() => setMaximo(7)} style={{cursor: 'pointer'}}>+ 7 días</button>
        <button onClick={() => setMaximo(15)} style={{cursor: 'pointer'}}>+ 15 días</button>
        <button onClick={() => setMaximo(30)} style={{cursor: 'pointer'}}>+ 30 días</button>
      </div>

      <table border="1" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', borderColor: '#444' }}>
        <thead>
          <tr style={{ backgroundColor: '#dddddd', color: 'black', fontWeight: 'bold' }}>
            <th style={{textAlign: 'left', padding: '10px'}}>PACIENTE</th>
            <th style={{padding: '10px'}}>VENCIDO</th>
            {maximo >= 7 && <th style={{padding: '10px'}}>PROX 7</th>}
            {maximo >= 15 && <th style={{padding: '10px'}}>PROX 15</th>}
            {maximo >= 30 && <th style={{padding: '10px'}}>PROX 30</th>}
            <th style={{padding: '10px'}}>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {datosFiltrados.map((p) => (
            <tr key={p.ID_PACIENTE} style={{ color: 'white' }}>
              <td style={{textAlign: 'left', padding: '8px', cursor: 'pointer', textDecoration: 'underline'}} onClick={() => verDetalle(p)}>{p.PACIENTE}</td>
              <td style={{padding: '8px'}}>${p.VENCIDO?.toLocaleString()}</td>
              {maximo >= 7 && <td style={{padding: '8px'}}>${p.PROX_7?.toLocaleString()}</td>}
              {maximo >= 15 && <td style={{padding: '8px'}}>${p.PROX_15?.toLocaleString()}</td>}
              {maximo >= 30 && <td style={{padding: '8px'}}>${p.PROX_30?.toLocaleString()}</td>}
              <td style={{padding: '8px'}}><strong>${calcularTotalFila(p).toLocaleString()}</strong></td>
            </tr>
          ))}
        </tbody>
        {/* ... (Tu tfoot original igual) */}
      </table>

      {/* Modal que se abre al hacer clic en el nombre */}
      {pacienteSeleccionado && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#222', padding: '30px', borderRadius: '8px', width: '600px', color: 'white' }}>
            <h2>Detalle: {pacienteSeleccionado.PACIENTE}</h2>
            <table style={{ width: '100%', marginTop: '20px', borderCollapse: 'collapse' }}>
              <tbody>
                {detalleDeuda.map((d, i) => (
                  <tr key={i} style={{borderBottom: '1px solid #444'}}>
                    <td style={{padding: '10px'}}>{d.prestacion}</td>
                    <td style={{textAlign: 'right', padding: '10px'}}>${d.saldo_pendiente?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setPacienteSeleccionado(null)} style={{ marginTop: '20px', padding: '10px 20px', cursor: 'pointer' }}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default EstadosCuenta;