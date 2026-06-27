import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

function EstadosCuenta() {
  const [datos, setDatos] = useState([]);
  const [maximo, setMaximo] = useState(0); 
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    async function fetchData() {
      const { data, error } = await supabase.from('data_gerencial').select('*');
      if (error) console.error("Error al obtener datos:", error);
      else setDatos(data || []);
    }
    fetchData();
  }, []);

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
      
      {/* Buscador Desplegable */}
      <div style={{ marginBottom: '20px' }}>
        <input 
          list="listaPacientes" 
          placeholder="Elegir o buscar paciente..." 
          value={busqueda} 
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ padding: '10px', width: '300px', color: 'black' }}
        />
        <datalist id="listaPacientes">
          {datos.map((p) => <option key={p.ID_PACIENTE} value={p.PACIENTE} />)}
        </datalist>
        <button onClick={() => setBusqueda('')} style={{marginLeft: '10px', padding: '10px', cursor: 'pointer'}}>Limpiar</button>
      </div>

      {/* Botones de Rango */}
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
              <td style={{textAlign: 'left', padding: '8px'}}>{p.PACIENTE}</td>
              <td style={{padding: '8px'}}>${p.VENCIDO?.toLocaleString()}</td>
              {maximo >= 7 && <td style={{padding: '8px'}}>${p.PROX_7?.toLocaleString()}</td>}
              {maximo >= 15 && <td style={{padding: '8px'}}>${p.PROX_15?.toLocaleString()}</td>}
              {maximo >= 30 && <td style={{padding: '8px'}}>${p.PROX_30?.toLocaleString()}</td>}
              <td style={{padding: '8px'}}><strong>${calcularTotalFila(p).toLocaleString()}</strong></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 'bold', backgroundColor: '#cccccc', color: 'black' }}>
            <td style={{textAlign: 'left', padding: '10px'}}>TOTALES</td>
            <td style={{padding: '10px'}}>${totales.vencido.toLocaleString()}</td>
            {maximo >= 7 && <td style={{padding: '10px'}}>${totales.prox7.toLocaleString()}</td>}
            {maximo >= 15 && <td style={{padding: '10px'}}>${totales.prox15.toLocaleString()}</td>}
            {maximo >= 30 && <td style={{padding: '10px'}}>${totales.prox30.toLocaleString()}</td>}
            <td style={{padding: '10px'}}>${totales.total.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default EstadosCuenta;