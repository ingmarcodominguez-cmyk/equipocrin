import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const MovimientosPrestadores = () => {
  const [datos, setDatos] = useState([]);
  const [prestadorSeleccionado, setPrestadorSeleccionado] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetchSaldos();
  }, []);

  async function fetchSaldos() {
    setCargando(true);
    // Agregamos ACUERDO al select
    const { data, error } = await supabase.from('prestadores').select(`
        ID_PRESTADOR, NOMBRE_PRESTADOR,
        movprestadores (ID_PRESTADOR, FECHA, CONCEPTO, DEBE, HABER, ACUERDO)
    `);
    
    if (error) {
      console.error("Error al obtener datos:", error);
    } else if (data) {
      const resultados = data.map(p => {
        const totalHaber = p.movprestadores.reduce((acc, m) => acc + (parseFloat(m.HABER) || 0), 0);
        const totalDebe = p.movprestadores.reduce((acc, m) => acc + (parseFloat(m.DEBE) || 0), 0);
        return { 
          ...p, 
          saldo: (totalHaber - totalDebe).toFixed(2) 
        };
      });
      setDatos(resultados);
    }
    setCargando(false);
  }

  if (prestadorSeleccionado) {
    return (
      <DetallePrestador 
        prestador={prestadorSeleccionado} 
        volver={() => setPrestadorSeleccionado(null)} 
      />
    );
  }

  return (
    <div style={{ color: '#fff', padding: '20px' }}>
      <h2>Saldo Final por Prestador</h2>
      {cargando ? <p>Cargando datos...</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #444' }}>
              <th style={{ textAlign: 'left', padding: '10px' }}>Nombre</th>
              <th style={{ textAlign: 'right', padding: '10px' }}>Saldo Final</th>
            </tr>
          </thead>
          <tbody>
            {datos.map((item, index) => (
              <tr 
                key={index} 
                style={{ borderBottom: '1px solid #222', cursor: 'pointer' }} 
                onClick={() => setPrestadorSeleccionado(item)}
              >
                <td style={{ padding: '10px', color: '#00f2ff' }}>{item.NOMBRE_PRESTADOR}</td>
                <td style={{ textAlign: 'right', padding: '10px' }}>$ {item.saldo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

const DetallePrestador = ({ prestador, volver }) => {
  const [movimientos, setMovimientos] = useState([]);

  useEffect(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hace10Dias = new Date(hoy);
    hace10Dias.setDate(hoy.getDate() - 10);
    
    const historialCompleto = [...prestador.movprestadores].sort(
      (a, b) => new Date(a.FECHA + 'T00:00:00') - new Date(b.FECHA + 'T00:00:00')
    );

    let saldoAcumulado = 0;
    const conSaldo = historialCompleto.map(m => {
      const debe = parseFloat(m.DEBE) || 0;
      const haber = parseFloat(m.HABER) || 0;
      saldoAcumulado += (haber - debe);
      return { ...m, saldo: saldoAcumulado.toFixed(2) };
    });

    const filtrados = conSaldo.filter(m => {
      const fechaMov = new Date(m.FECHA + 'T00:00:00');
      return fechaMov >= hace10Dias;
    });

    setMovimientos(filtrados.reverse());
  }, [prestador]);

  return (
    <div style={{ color: '#fff', padding: '20px' }}>
      <button onClick={volver} style={{ marginBottom: '20px', padding: '8px 16px', cursor: 'pointer' }}>
        ← VOLVER
      </button>
      <h3>Resumen: {prestador.NOMBRE_PRESTADOR} (Últimos 10 días)</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #444' }}>
            <th style={{ textAlign: 'left', padding: '10px' }}>Fecha</th>
            <th style={{ textAlign: 'left', padding: '10px' }}>Concepto</th>
            <th style={{ textAlign: 'left', padding: '10px' }}>Acuerdo</th>
            <th style={{ textAlign: 'right', padding: '10px' }}>Debe</th>
            <th style={{ textAlign: 'right', padding: '10px' }}>Haber</th>
            <th style={{ textAlign: 'right', padding: '10px' }}>Saldo</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #333' }}>
              <td style={{ padding: '8px' }}>{new Date(m.FECHA + 'T00:00:00').toLocaleDateString()}</td>
              <td style={{ padding: '8px' }}>{m.CONCEPTO}</td>
              <td style={{ padding: '8px' }}>{m.ACUERDO || '-'}</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{m.DEBE > 0 ? `$${parseFloat(m.DEBE).toFixed(2)}` : '-'}</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{m.HABER > 0 ? `$${parseFloat(m.HABER).toFixed(2)}` : '-'}</td>
              <td style={{ padding: '8px', textAlign: 'right', color: m.saldo >= 0 ? '#00ff00' : '#ff4444' }}>
                ${m.saldo}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default MovimientosPrestadores;