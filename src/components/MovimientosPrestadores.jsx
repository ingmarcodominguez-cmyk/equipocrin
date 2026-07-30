import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const MovimientosPrestadores = () => {
  const parsearDecimal = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    
    const str = String(val).replace(/\$/g, '').trim();
    
    if (str.includes(',')) {
      const limpio = str.replace(/\./g, '').replace(',', '.');
      const num = Number(limpio);
      return isNaN(num) ? 0 : num;
    }
    
    if (str.includes('.')) {
      const partes = str.split('.');
      if (partes.length > 2) {
        const limpio = str.replace(/\./g, '');
        const num = Number(limpio);
        return isNaN(num) ? 0 : num;
      }
      
      const decimales = partes[1];
      if (decimales.length === 3) {
        const limpio = str.replace(/\./g, '');
        const num = Number(limpio);
        return isNaN(num) ? 0 : num;
      }
      
      const num = Number(str);
      return isNaN(num) ? 0 : num;
    }
    
    const num = Number(str);
    return isNaN(num) ? 0 : num;
  };

  const [datos, setDatos] = useState([]);
  const [prestadorSeleccionado, setPrestadorSeleccionado] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetchSaldos();
  }, []);

  async function fetchSaldos() {
    setCargando(true);
    try {
      const { data: listaP, error: errorP } = await supabase
        .from('prestadores_motor')
        .select('id_prestador, nombre_prestador')
        .order('nombre_prestador', { ascending: true });

      if (errorP) throw errorP;

      let movements = [];
      let epoch = 0;
      let tieneMas = true;
      while (tieneMas) {
        const { data, error } = await supabase
          .from('movprestadores_motor')
          .select('id_prestador, debe, haber')
          .range(epoch * 1000, (epoch + 1) * 1000 - 1);

        if (error) throw error;
        if (!data || data.length === 0) {
          tieneMas = false;
        } else {
          movements = [...movements, ...data];
          if (data.length < 1000) {
            tieneMas = false;
          } else {
            epoch++;
          }
        }
      }

      // Calcular saldos por id_prestador en memoria
      const saldosMap = {};
      movements.forEach(m => {
        const pId = m.id_prestador;
        const debe = parsearDecimal(m.debe);
        const haber = parsearDecimal(m.haber);
        if (!saldosMap[pId]) saldosMap[pId] = 0;
        saldosMap[pId] += (haber - debe);
      });

      const resultados = (listaP || []).map(p => {
        let saldoVal = saldosMap[p.id_prestador] || 0;
        if (Math.abs(saldoVal) < 100) {
          saldoVal = 0;
        }
        return {
          ...p,
          saldo: saldoVal.toFixed(2)
        };
      });

      setDatos(resultados);
    } catch (err) {
      console.error("Error al obtener datos de prestadores:", err);
    } finally {
      setCargando(false);
    }
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
                <td style={{ padding: '10px', color: '#00f2ff' }}>{item.nombre_prestador}</td>
                <td style={{ textAlign: 'right', padding: '10px' }}>$ {parseFloat(item.saldo).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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
  const [todosMovimientos, setTodosMovimientos] = useState([]);
  const [cargandoMovs, setCargandoMovs] = useState(true);

  useEffect(() => {
    async function loadMovs() {
      setCargandoMovs(true);
      try {
        const { data, error } = await supabase
          .from('movprestadores_motor')
          .select('*')
          .eq('id_prestador', prestador.id_prestador)
          .order('fecha', { ascending: true });

        if (error) throw error;

        setTodosMovimientos(data || []);

        let saldoAcumulado = 0;
        const conSaldo = (data || []).map(m => {
          const debe = parsearDecimal(m.debe);
          const haber = parsearDecimal(m.haber);
          saldoAcumulado += (haber - debe);
          return { ...m, saldo: saldoAcumulado.toFixed(2) };
        });

        setMovimientos(conSaldo.reverse());
      } catch (err) {
        console.error("Error al cargar movimientos de prestador:", err);
      } finally {
        setCargandoMovs(false);
      }
    }
    loadMovs();
  }, [prestador]);

  const manejarDescargaExcel = () => {
    // 1. Todos los movimientos (ya vienen ordenados cronológicamente desde la consulta)
    const sortedMovs = [...todosMovimientos];

    // 2. Calcular saldo acumulado en orden ascendente
    let running = 0;
    const conSaldo = sortedMovs.map(m => {
      const debe = parseFloat(String(m.debe || '0').replace(/\./g, '').replace(',', '.')) || 0;
      const haber = parseFloat(String(m.haber || '0').replace(/\./g, '').replace(',', '.')) || 0;
      running += (haber - debe);
      return {
        ...m,
        debeNum: debe,
        haberNum: haber,
        saldoCalculado: running
      };
    });

    // 3. Buscar último saldo en cero (tolerancia $1)
    let startIndex = -1;
    for (let i = conSaldo.length - 1; i >= 0; i--) {
      if (Math.abs(conSaldo[i].saldoCalculado) < 1.0) {
        startIndex = i;
        break;
      }
    }

    // 4. Si no hay saldo cero, buscar el último pago
    if (startIndex === -1) {
      for (let i = conSaldo.length - 1; i >= 0; i--) {
        const concepto = (conSaldo[i].concepto || '').toUpperCase();
        const subtipo = (conSaldo[i].subtipo || '').toUpperCase();
        if (subtipo.includes('PAGO') || concepto.includes('PAGO')) {
          startIndex = i;
          break;
        }
      }
    }

    // 5. Si tampoco hay pagos, exportamos todos
    if (startIndex === -1) {
      startIndex = 0;
    }

    // 6. Recortar la lista de movimientos para el reporte
    const filtradosReporte = conSaldo.slice(startIndex);

    // 7. Generar el CSV compatible con Excel en español
    const BOM = "\uFEFF";
    let csv = "Fecha;Concepto;Acuerdo;Debe ($);Haber ($);Saldo ($)\r\n";

    filtradosReporte.forEach(m => {
      const fecha = m.fecha ? new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-AR') : 'S/D';
      const concepto = (m.concepto || '').replace(/;/g, ',');
      const acuerdo = (m.acuerdo || '-').replace(/;/g, ',');
      const debeStr = m.debeNum > 0 ? m.debeNum.toFixed(2).replace('.', ',') : '';
      const haberStr = m.haberNum > 0 ? m.haberNum.toFixed(2).replace('.', ',') : '';
      const saldoStr = m.saldoCalculado.toFixed(2).replace('.', ',');
      
      csv += `${fecha};${concepto};${acuerdo};${debeStr};${haberStr};${saldoStr}\r\n`;
    });

    // 8. Descargar el archivo
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Liquidacion_${prestador.nombre_prestador.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ color: '#fff', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '10px', flexWrap: 'wrap' }}>
        <button onClick={volver} style={{ padding: '8px 16px', cursor: 'pointer', background: '#333', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}>
          ← VOLVER
        </button>
        {todosMovimientos.length > 0 && (
          <button 
            onClick={manejarDescargaExcel} 
            style={{ padding: '8px 16px', cursor: 'pointer', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}
          >
            📥 Descargar Liquidación (Excel)
          </button>
        )}
      </div>
      <h3>Resumen de Cuenta: {prestador.nombre_prestador}</h3>
      {cargandoMovs ? <p>Cargando movimientos...</p> : (
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
                <td style={{ padding: '8px' }}>{m.fecha ? new Date(m.fecha + 'T00:00:00').toLocaleDateString() : 'S/D'}</td>
                <td style={{ padding: '8px' }}>{m.concepto}</td>
                <td style={{ padding: '8px' }}>{m.acuerdo || '-'}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{parsearDecimal(m.debe) > 0 ? `$${parsearDecimal(m.debe).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{parsearDecimal(m.haber) > 0 ? `$${parsearDecimal(m.haber).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: parsearDecimal(m.saldo) >= 0 ? '#00ff00' : '#ff4444' }}>
                  ${parsearDecimal(m.saldo).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default MovimientosPrestadores;