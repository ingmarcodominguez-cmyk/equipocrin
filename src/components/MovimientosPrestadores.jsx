import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const MovimientosPrestadores = ({ userData }) => {
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
  const [errorVinc, setErrorVinc] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 600);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 600);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchSaldos();
  }, []);

  const encontrarPrestadorId = (usuarioNombre, prestadoresList) => {
    if (!usuarioNombre) return null;
    const normalizedUser = usuarioNombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const userWords = normalizedUser.split(/\s+/).filter(w => w.length >= 2);

    for (const p of prestadoresList) {
      const normalizedPrestador = p.nombre_prestador.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const prestadorWords = normalizedPrestador.split(/\s+/).filter(w => w.length >= 2);
      
      const match = userWords.every(word => prestadorWords.includes(word));
      if (match) return p.id_prestador;
    }
    
    for (const p of prestadoresList) {
      const normalizedPrestador = p.nombre_prestador.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const prestadorWords = normalizedPrestador.split(/\s+/).filter(w => w.length >= 2);
      
      const matches = userWords.filter(word => prestadorWords.includes(word));
      if (matches.length >= 2) {
        return p.id_prestador;
      }
    }

    return null;
  };

  async function fetchSaldos() {
    setCargando(true);
    setErrorVinc(null);
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
          .select('id_prestador, debe, haber, id_pago, concepto')
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

      // Filtrar movimientos pertenecientes a pagos que fueron revertidos
      const revertedPagoIds = new Set();
      movements.forEach(m => {
        const concepto = (m.concepto || '').toUpperCase();
        if (concepto.startsWith('REVERSO') && m.id_pago) {
          revertedPagoIds.add(m.id_pago);
        }
      });
      const filteredMovements = movements.filter(m => !m.id_pago || !revertedPagoIds.has(m.id_pago));

      const saldosMap = {};
      filteredMovements.forEach(m => {
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

      // Auto-vincular si no es supervisor (Dirección / Administración)
      const rol = userData?.rol?.toUpperCase() || "";
      const esSupervisor = ['DIRECCION', 'ADMINISTRACION'].includes(rol);
      if (!esSupervisor) {
        const matchedId = encontrarPrestadorId(userData.nombre, resultados);
        if (matchedId) {
          const matchedP = resultados.find(p => p.id_prestador === matchedId);
          if (matchedP) {
            setPrestadorSeleccionado(matchedP);
          } else {
            setErrorVinc("No se encontró su cuenta en el listado de saldos.");
          }
        } else {
          setErrorVinc(`No se encontró una cuenta corriente vinculada al usuario "${userData.nombre}". Por favor contacte a Dirección.`);
        }
      }
    } catch (err) {
      console.error("Error al obtener datos de prestadores:", err);
    } finally {
      setCargando(false);
    }
  }

  const userRol = userData?.rol?.toUpperCase() || "";
  const hideVolver = !['DIRECCION', 'ADMINISTRACION'].includes(userRol);

  if (errorVinc) {
    return (
      <div style={{ color: '#fff', padding: '20px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ background: '#3b0712', border: '1px solid #991b1b', borderRadius: '12px', padding: '20px', maxWidth: '400px', margin: '40px auto' }}>
          <span style={{ fontSize: '32px' }}>⚠️</span>
          <h3 style={{ color: '#fca5a5', marginTop: '10px', fontSize: '15px' }}>Vincular Cuenta Corriente</h3>
          <p style={{ color: '#fecaca', fontSize: '13px', lineHeight: '1.5', margin: '10px 0 0 0' }}>{errorVinc}</p>
        </div>
      </div>
    );
  }

  if (prestadorSeleccionado) {
    return (
      <DetallePrestador 
        prestador={prestadorSeleccionado} 
        volver={() => setPrestadorSeleccionado(null)} 
        hideVolver={hideVolver}
        isMobile={isMobile}
        parsearDecimal={parsearDecimal}
      />
    );
  }

  const esViviana = (nombre) => {
    const norm = (nombre || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return norm.includes('VIVIANA');
  };

  const totalAPagar = datos.reduce((acc, item) => {
    if (esViviana(item.nombre_prestador)) return acc;
    const saldoNum = parseFloat(item.saldo) || 0;
    return saldoNum > 0 ? acc + saldoNum : acc;
  }, 0);

  const cantPrestadoresAPagar = datos.filter(item => {
    if (esViviana(item.nombre_prestador)) return false;
    return (parseFloat(item.saldo) || 0) > 0;
  }).length;

  return (
    <div style={{ color: '#fff', padding: isMobile ? '10px' : '20px', fontFamily: 'sans-serif' }}>
      <h2 style={{ fontSize: isMobile ? '18px' : '22px', margin: '0 0 15px 0' }}>Saldo Final por Prestador</h2>
      
      {/* TARJETA RESUMEN: TOTAL A PAGAR */}
      {!cargando && datos.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)',
          border: '1px solid #10b981',
          borderRadius: '12px',
          padding: isMobile ? '14px' : '18px 24px',
          marginBottom: '20px',
          boxShadow: '0 4px 15px rgba(16, 185, 129, 0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '18px' }}>💵</span>
            <span style={{ fontSize: isMobile ? '12px' : '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#a7f3d0' }}>
              Total a Pagar a Prestadores
            </span>
          </div>
          <div style={{ fontSize: isMobile ? '24px' : '30px', fontWeight: 'bold', color: '#ffffff' }}>
            $ {totalAPagar.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '12px', color: '#6ee7b7', marginTop: '4px' }}>
            ✓ Suma exclusiva de saldos positivos ({cantPrestadoresAPagar} profesionales a liquidar) • Descontada Viviana Jiménez
          </div>
        </div>
      )}

      {cargando ? (
        <p style={{ fontSize: '14px', color: '#888' }}>Cargando datos...</p>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #444' }}>
                <th style={{ textAlign: 'left', padding: isMobile ? '10px 8px' : '12px 10px', fontSize: isMobile ? '13px' : '14px' }}>Nombre</th>
                <th style={{ textAlign: 'right', padding: isMobile ? '10px 8px' : '12px 10px', fontSize: isMobile ? '13px' : '14px' }}>Saldo Final</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((item, index) => (
                <tr 
                  key={index} 
                  style={{ borderBottom: '1px solid #222', cursor: 'pointer' }} 
                  onClick={() => setPrestadorSeleccionado(item)}
                >
                  <td style={{ padding: isMobile ? '11px 8px' : '10px', color: '#00f2ff', fontSize: isMobile ? '13px' : '14px' }}>
                    {item.nombre_prestador}
                  </td>
                  <td style={{ 
                    textAlign: 'right', 
                    padding: isMobile ? '11px 8px' : '10px',
                    color: parseFloat(item.saldo) < 0 ? '#f87171' : '#fff',
                    fontSize: isMobile ? '13px' : '14px',
                    fontWeight: '500'
                  }}>
                    $ {parseFloat(item.saldo).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #10b981', background: '#064e3b', fontWeight: 'bold' }}>
                <td style={{ padding: isMobile ? '12px 8px' : '14px 10px', color: '#a7f3d0', fontSize: isMobile ? '12.5px' : '14px' }}>
                  TOTAL A PAGAR <span style={{ fontSize: isMobile ? '10px' : '12px', fontWeight: 'normal', color: '#6ee7b7', display: isMobile ? 'block' : 'inline' }}>(Saldos positivos sin Viviana Jiménez)</span>
                </td>
                <td style={{ textAlign: 'right', padding: isMobile ? '12px 8px' : '14px 10px', color: '#ffffff', fontSize: isMobile ? '15px' : '17px' }}>
                  $ {totalAPagar.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

const DetallePrestador = ({ prestador, volver, hideVolver, isMobile, parsearDecimal }) => {
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
          .order('fecha', { ascending: true })
          .order('debe', { ascending: true })
          .order('id_mov', { ascending: true });

        if (error) throw error;

        const revertedPagoIds = new Set();
        (data || []).forEach(m => {
          const concepto = (m.concepto || '').toUpperCase();
          if (concepto.startsWith('REVERSO') && m.id_pago) {
            revertedPagoIds.add(m.id_pago);
          }
        });

        const filtered = (data || []).filter(m => !m.id_pago || !revertedPagoIds.has(m.id_pago));
        setTodosMovimientos(filtered);

        let saldoAcumulado = 0;
        const conSaldo = filtered.map(m => {
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
    const sortedMovs = [...todosMovimientos];
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

    let startIndex = -1;
    for (let i = conSaldo.length - 1; i >= 0; i--) {
      if (Math.abs(conSaldo[i].saldoCalculado) < 1.0) {
        startIndex = i;
        break;
      }
    }

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

    if (startIndex === -1) {
      startIndex = 0;
    }

    const filtradosReporte = conSaldo.slice(startIndex);
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
    <div style={{ color: '#fff', padding: isMobile ? '5px' : '20px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '10px', flexWrap: 'wrap' }}>
        {!hideVolver ? (
          <button onClick={volver} style={{ padding: '8px 16px', cursor: 'pointer', background: '#333', color: '#fff', border: '1px solid #444', borderRadius: '6px', fontSize: '13px' }}>
            ← VOLVER
          </button>
        ) : <div />}
        {todosMovimientos.length > 0 && (
          <button 
            onClick={manejarDescargaExcel} 
            style={{ padding: '8px 16px', cursor: 'pointer', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px' }}
          >
            📥 Descargar Liquidación (Excel)
          </button>
        )}
      </div>
      
      <h3 style={{ fontSize: isMobile ? '16px' : '18px', margin: '0 0 15px 0' }}>Resumen de Cuenta: {prestador.nombre_prestador}</h3>
      
      {cargandoMovs ? (
        <p style={{ fontSize: '14px', color: '#888' }}>Cargando movimientos...</p>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
          {movimientos.map((m, i) => {
            const debeVal = parsearDecimal(m.debe);
            const haberVal = parsearDecimal(m.haber);
            const saldoVal = parsearDecimal(m.saldo);
            return (
              <div 
                key={i} 
                style={{ 
                  background: '#1a1a1a', 
                  border: '1px solid #333', 
                  borderRadius: '10px', 
                  padding: '12px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '6px' 
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#888' }}>
                    📅 {m.fecha ? new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-AR') : 'S/D'}
                  </span>
                  <span style={{ 
                    fontSize: '13px', 
                    fontWeight: 'bold', 
                    color: saldoVal >= 0 ? '#00ff00' : '#ff4444' 
                  }}>
                    Saldo: ${saldoVal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#fff', fontWeight: '600' }}>
                  {m.concepto}
                </div>
                {m.acuerdo && (
                  <div style={{ fontSize: '11px', color: '#aaa' }}>
                    🤝 Acuerdo: {m.acuerdo}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '15px', borderTop: '1px solid #222', paddingTop: '6px', marginTop: '4px', fontSize: '12px' }}>
                  {debeVal > 0 && (
                    <span style={{ color: '#ff4444' }}>
                      Debe: -${debeVal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                  {haberVal > 0 && (
                    <span style={{ color: '#00ff00' }}>
                      Haber: +${haberVal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
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