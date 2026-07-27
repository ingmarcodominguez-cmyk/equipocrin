import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import Layout from './components/Layout.jsx'
import FormularioPaciente from './components/FormularioPaciente.jsx'
import FormularioAcuerdo from './components/FormularioAcuerdo.jsx'
import FichaPaciente from './components/FichaPaciente.jsx'
import SimuladorMotorMora from './components/SimuladorMotorMora.jsx'

function App() {
  const [session, setSession] = useState(null)
  const [userData, setUserData] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(true)
  const [mensajeCarga, setMensajeCarga] = useState('Iniciando sistema...')
  
  const [modoSeleccionado, setModoSeleccionado] = useState(null)
  const [crinAccion, setCrinAccion] = useState(null)
  
  const [listaPacientes, setListaPacientes] = useState([])
  const [busquedaPaciente, setBusquedaPaciente] = useState('')
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null)
  const [cargandoPacientes, setCargandoPacientes] = useState(false)

  // Estado para el emulador de fecha global y porcentaje de aumento en interfaz
  const [fechaSimuladaInput, setFechaSimuladaInput] = useState(
    localStorage.getItem('crin_fecha_trabajo_simulada') || new Date().toISOString().split('T')[0]
  )
  const [porcentajeAumentoInput, setPorcentajeAumentoInput] = useState('0')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) cargarPerfil(data.session.user.id)
      else setCargando(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) cargarPerfil(session.user.id)
      else { 
        setUserData(null)
        setCargando(false)
        setModoSeleccionado(null)
        setCrinAccion(null)
        setPacienteSeleccionado(null) 
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function cargarPerfil(userId) {
    setCargando(true)
    setMensajeCarga('Cargando perfil de usuario...')
    const { data: perfil } = await supabase.from('users').select('*').eq('id', userId).single()
    setUserData(perfil)
    setCargando(false)
  }

  async function cargarPacientesParaListar() {
    setCargandoPacientes(true)
    const { data, error } = await supabase
      .from('pacientes_motor')
      .select('*')
      .order('nombre_apellido', { ascending: true })
    
    if (error) {
      alert('Error al cargar pacientes: ' + error.message)
    } else {
      setListaPacientes(data || [])
    }
    setCargandoPacientes(false)
  }

  // Obtener fecha de trabajo actual (respeta el emulador)
  function obtenerFechaTrabajo() {
    const fechaSimuladaStr = localStorage.getItem('crin_fecha_trabajo_simulada');
    if (fechaSimuladaStr) {
      return new Date(fechaSimuladaStr + 'T00:00:00');
    }
    return new Date();
  }

  function obtenerSiguientePeriodo(periodo) {
    const anio = Math.floor(periodo / 100);
    const mes = periodo % 100;
    let nuevoMes = mes + 1;
    let nuevoAnio = anio;
    if (nuevoMes > 12) {
      nuevoMes = 1;
      nuevoAnio++;
    }
    return (nuevoAnio * 100) + nuevoMes;
  }

  // ⚙️ MOTOR DE GENERACIÓN DE CUOTAS (CON VIGÍA A PRUEBA DE BRECHAS)
  async function generarCuotasMensualesDB(forzarPrueba = false) {
    try {
      const fechaTrabajo = obtenerFechaTrabajo();
      const mesActual = fechaTrabajo.getMonth() + 1; 
      const anioActual = fechaTrabajo.getFullYear();
      const periodoActualInt = (anioActual * 100) + mesActual; 

      const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

      const porcentajeAumento = parseFloat(porcentajeAumentoInput) || 0;

      // 1. Consultar al VIGÍA (tabla control_periodos_motor)
      const { data: periodosProcesados, error: errorVigia } = await supabase
        .from('control_periodos_motor')
        .select('periodo_int')
        .order('periodo_int', { ascending: false })
        .limit(1);

      if (errorVigia) {
        throw new Error("Error al consultar el vigía: " + errorVigia.message);
      }

      const ultimoPeriodoProcesado = periodosProcesados && periodosProcesados.length > 0 ? periodosProcesados[0].periodo_int : 0;

      if (ultimoPeriodoProcesado >= periodoActualInt && !forzarPrueba) {
        return;
      }

      // Determinamos los períodos a generar para cubrir cualquier brecha
      const periodosAProcesar = [];
      if (ultimoPeriodoProcesado === 0 || forzarPrueba) {
        periodosAProcesar.push(periodoActualInt);
      } else {
        let aux = obtenerSiguientePeriodo(ultimoPeriodoProcesado);
        while (aux <= periodoActualInt) {
          periodosAProcesar.push(aux);
          aux = obtenerSiguientePeriodo(aux);
        }
      }

      // 2. Traer acuerdos activos
      const { data: acuerdosActivos, error: errorAcuerdos } = await supabase
        .from('acuerdos_motor')
        .select('*');

      if (errorAcuerdos) {
        throw new Error("Error al consultar acuerdos_motor: " + errorAcuerdos.message);
      }

      const acuerdosFiltrados = (acuerdosActivos || []).filter(acuerdo => {
        const tipo = (acuerdo.tipo_acuerdo || '').trim().toLowerCase();
        const estado = (acuerdo.estado || '').trim().toLowerCase();
        return tipo === 'mensual' && estado === 'activo';
      });

      if (acuerdosFiltrados.length === 0) {
        return;
      }

      // 3. Obtener mayor id_deuda existente
      const { data: todosMovimientos, error: errorMovs } = await supabase
        .from('movimientoscuenta_motor')
        .select('id_deuda')
        .order('id_movimiento', { ascending: false });

      if (errorMovs) {
        throw new Error("Error al consultar movimientoscuenta_motor: " + errorMovs.message);
      }

      let maxIdDeuda = 0;
      if (todosMovimientos) {
        for (const mov of todosMovimientos) {
          const idDeudaNum = parseInt(mov.id_deuda, 10);
          if (!isNaN(idDeudaNum) && idDeudaNum > maxIdDeuda) {
            maxIdDeuda = idDeudaNum;
          }
        }
      }

      const nuevosMovimientosBulk = [];
      const actualizacionesAcuerdos = [];
      const controlPeriodosBulk = [];

      // Mapeamos los acuerdos filtrados a memoria para llevar registro de sus importes
      const listaAcuerdosEnMemoria = acuerdosFiltrados.map(a => {
        const importeStr = String(a.importe_actual || '0')
          .replace(/\./g, '')       
          .replace(',', '.');       

        let importeBase = parseFloat(importeStr);
        if (isNaN(importeBase)) importeBase = 0;
        
        return {
          ...a,
          importeBase
        };
      });

      // Procesamos cada período faltante cronológicamente
      for (const periodo of periodosAProcesar) {
        const anio = Math.floor(periodo / 100);
        const mes = periodo % 100;
        const nombreMesStr = nombresMeses[mes - 1];

        controlPeriodosBulk.push({
          periodo_int: periodo,
          nombre_periodo: `${nombreMesStr} ${anio}`
        });

        for (const acuerdo of listaAcuerdosEnMemoria) {
          let nuevoImporte = acuerdo.importeBase;

          // El porcentaje de aumento solo se aplica al período final de trabajo actual
          if (periodo === periodoActualInt && porcentajeAumento > 0) {
            nuevoImporte = nuevoImporte * (1 + porcentajeAumento / 100);
            nuevoImporte = Math.round(nuevoImporte * 100) / 100; 
            acuerdo.importeBase = nuevoImporte; // Actualizamos para que sirva de base si hubiera más meses
          }

          maxIdDeuda++;
          const nuevoIdDeuda = maxIdDeuda.toString();

          const diaVencimientoPactado = acuerdo.dia_vencimiento || 10;
          const mesStrPadded = String(mes).padStart(2, '0');
          const diaStrPadded = String(diaVencimientoPactado).padStart(2, '0');
          const fechaVencimientoStr = `${anio}-${mesStrPadded}-${diaStrPadded}`;
          const fechaMovimientoStr = `${anio}-${mesStrPadded}-01`;

          nuevosMovimientosBulk.push({
            id_acuerdo: acuerdo.id_acuerdo,
            id_paciente: acuerdo.id_paciente,
            id_deuda: nuevoIdDeuda,
            tipo_movimiento: 'cuota',
            subtipo: 'cuota_mensual',
            concepto: `Cuota ${nombreMesStr} ${anio}`,
            debe: nuevoImporte.toString(),
            haber: '0',
            ciclo_mora: periodo,
            fecha_movimiento: fechaMovimientoStr,
            fecha_vencimiento: fechaVencimientoStr,
            fecha_cuota_origen: fechaVencimientoStr
          });
        }
      }

      // Si hubo aumento, actualizamos el precio final de los acuerdos en la base de datos
      if (porcentajeAumento > 0) {
        for (const acuerdo of listaAcuerdosEnMemoria) {
          actualizacionesAcuerdos.push(
            supabase
              .from('acuerdos_motor')
              .update({ importe_actual: acuerdo.importeBase.toString() })
              .eq('id_acuerdo', acuerdo.id_acuerdo)
          );
        }
      }

      // Insertamos los movimientos generados
      if (nuevosMovimientosBulk.length > 0) {
        const { error: errorBulkInsert } = await supabase
          .from('movimientoscuenta_motor')
          .insert(nuevosMovimientosBulk);

        if (errorBulkInsert) {
          throw new Error("Error al insertar cuotas masivas: " + errorBulkInsert.message);
        }
      }

      // Guardamos la actualización de importes
      if (actualizacionesAcuerdos.length > 0) {
        await Promise.all(actualizacionesAcuerdos);
      }

      // Guardamos el control de períodos procesados usando upsert para evitar errores de duplicado
      if (controlPeriodosBulk.length > 0) {
        const { error: errorControl } = await supabase
          .from('control_periodos_motor')
          .upsert(controlPeriodosBulk);

        if (errorControl) {
          throw new Error("Error al insertar control de períodos: " + errorControl.message);
        }
      }

    } catch (err) {
      console.error("Excepción en generarCuotasMensualesDB:", err);
      alert('❌ Error crítico en el motor de cuotas: ' + (err.message || JSON.stringify(err)));
    }
  }

// ⚡ MOTOR DE RECARGOS CORREGIDO (FACTOR MATEMÁTICO EXACTO)
  async function ejecutarMotorRecargosDB(fechaTrabajo) {
    try {
      const { data: movimientos, error: errorMovs } = await supabase
        .from('movimientoscuenta_motor')
        .select('*')
        .order('fecha_movimiento', { ascending: true });

      if (errorMovs) {
        throw new Error("Error al obtener movimientos para recargos: " + errorMovs.message);
      }

      if (!movimientos || movimientos.length === 0) return;

      const deudasMap = {};
      movimientos.forEach(m => {
        if (!m.id_deuda) return;
        if (!deudasMap[m.id_deuda]) {
          deudasMap[m.id_deuda] = {
            id_deuda: m.id_deuda,
            id_paciente: m.id_paciente,
            id_acuerdo: m.id_acuerdo,
            subtipo: m.subtipo,
            fecha_vencimiento: m.fecha_vencimiento,
            movimientos: []
          };
        }
        deudasMap[m.id_deuda].movimientos.push(m);
      });

      let maxIdMovimiento = movimientos.reduce((max, m) => {
        const idNum = parseInt(m.id_movimiento, 10);
        return !isNaN(idNum) && idNum > max ? idNum : max;
      }, 0);

      const nuevosRecargosBulk = [];

      for (const idDeuda in deudasMap) {
        const deuda = deudasMap[idDeuda];

        const cuotaBase = deuda.movimientos.find(m => m.subtipo === 'cuota_mensual');
        if (!cuotaBase) continue;

        if (!deuda.fecha_vencimiento) continue;
        const [anioVenc, mesVenc, diaVenc] = deuda.fecha_vencimiento.split('-').map(Number);
        const fechaVencObj = new Date(anioVenc, mesVenc - 1, diaVenc);

        const diffTiempo = fechaTrabajo.getTime() - fechaVencObj.getTime();
        const diasAtrasoTotal = Math.floor(diffTiempo / (1000 * 60 * 60 * 24));

        if (diasAtrasoTotal <= 0) continue;

        const recargosExistentes = deuda.movimientos.filter(m => 
          m.subtipo === 'recargo_mora' || (m.concepto && m.concepto.toLowerCase().includes('recargo'))
        );

        const hitosEsperados = [];
        if (diasAtrasoTotal >= 1) hitosEsperados.push({ nro: 1, diasReq: 1, porcentaje: 0.10, label: 'Recargo por mora (10%)' });
        if (diasAtrasoTotal >= 11) hitosEsperados.push({ nro: 2, diasReq: 11, porcentaje: 0.05, label: 'Recargo por mora escalón (2)' });
        if (diasAtrasoTotal >= 21) hitosEsperados.push({ nro: 3, diasReq: 21, porcentaje: 0.05, label: 'Recargo por mora escalón (3)' });
        if (diasAtrasoTotal >= 31) hitosEsperados.push({ nro: 4, diasReq: 31, porcentaje: 0.05, label: 'Recargo por mora escalón (4)' });
        if (diasAtrasoTotal >= 41) hitosEsperados.push({ nro: 5, diasReq: 41, porcentaje: 0.05, label: 'Recargo por mora escalón (5)' });

        if (recargosExistentes.length >= hitosEsperados.length) continue;

        let listaSimulada = [...deuda.movimientos];
        const importeCuotaBase = parseFloat(cuotaBase.debe || 0);

        for (let i = 0; i < hitosEsperados.length; i++) {
          const hito = hitosEsperados[i];
          
          if (i < recargosExistentes.length) continue;

          let debeSim = listaSimulada.reduce((acc, m) => acc + parseFloat(m.debe || 0), 0);
          let haberSim = listaSimulada.reduce((acc, m) => acc + parseFloat(m.haber || 0), 0);
          let saldoAcumuladoActual = debeSim - haberSim;

          if (saldoAcumuladoActual <= 0) break;

          let baseCalculo = (hito.nro === 1) ? importeCuotaBase : saldoAcumuladoActual;

          // Cálculo limpio sin alterar puntos decimales raros
          const montoRecargo = Math.round((baseCalculo * hito.porcentaje) * 100) / 100;
          maxIdMovimiento++;

          const fechaHitoObj = new Date(fechaVencObj.getTime());
          fechaHitoObj.setDate(fechaHitoObj.getDate() + (hito.diasReq - 1));
          
          const fechaEfectivaRecargo = fechaHitoObj > fechaTrabajo ? fechaTrabajo : fechaHitoObj;
          const fechaStr = fechaEfectivaRecargo.toISOString().split('T')[0];

          const nuevoRecargoItem = {
            id_acuerdo: deuda.id_acuerdo,
            id_paciente: deuda.id_paciente,
            id_deuda: deuda.id_deuda,
            tipo_movimiento: 'deuda',
            subtipo: 'recargo_mora',
            concepto: hito.label,
            debe: montoRecargo.toString(), // Se guarda como string plano limpio (ej: "29040" o "16770.6")
            haber: '0',
            fecha_movimiento: fechaStr,
            fecha_vencimiento: deuda.fecha_vencimiento
          };

          nuevosRecargosBulk.push(nuevoRecargoItem);
          listaSimulada.push(nuevoRecargoItem);
        }
      }

      if (nuevosRecargosBulk.length > 0) {
        const { error: errorInsertRecargos } = await supabase
          .from('movimientoscuenta_motor')
          .insert(nuevosRecargosBulk);

        if (errorInsertRecargos) {
          console.error("Error al insertar recargos:", errorInsertRecargos.message);
        } else {
          console.log(`[Motor de Mora] Se insertaron ${nuevosRecargosBulk.length} recargos correctamente.`);
        }
      }

    } catch (err) {
      console.error("Error crítico en ejecutarMotorRecargosDB:", err);
    }
  }

  // 🚀 FUNCIÓN MAESTRA CON MENSAJES DE PROGRESO Y BLOQUEO VISUAL
  const handleAccesoSistemaCrin = async () => {
    setCargando(true);
    try {
      const fechaActualTrabajo = obtenerFechaTrabajo();

      setMensajeCarga('Verificando y generando cuotas mensuales...');
      await generarCuotasMensualesDB(false);

      setMensajeCarga('Calculando y aplicando recargos por mora...');
      if (typeof ejecutarMotorRecargosDB === 'function') {
        await ejecutarMotorRecargosDB(fechaActualTrabajo);
      }

      setMensajeCarga('¡Todo listo! Abriendo Sistema Crin...');
      await new Promise(resolve => setTimeout(resolve, 800));

      setModoSeleccionado('crin');
    } catch (error) {
      console.error("Error al iniciar Sistema Crin:", error);
      alert("Hubo un error al procesar los motores automáticos.");
    } finally {
      setCargando(false);
      setMensajeCarga('Cargando...');
    }
  };

  async function login() {
    setCargando(true);
    setMensajeCarga('Iniciando sesión...');
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setCargando(false);
      alert('Login incorrecto: ' + error.message);
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    setModoSeleccionado(null)
    setCrinAccion(null)
    setPacienteSeleccionado(null)
    window.location.reload()
  }

  if (cargando) {
    return (
      <div style={{ backgroundColor: '#000', minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif', gap: '20px' }}>
        <div style={{ width: '50px', height: '50px', border: '5px solid #333', borderTop: '5px solid #00f2ff', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ color: '#00f2ff', margin: '0 0 10px 0' }}>Trabajando en el Sistema...</h3>
          <p style={{ color: '#aaa', fontSize: '14px', margin: 0 }}>{mensajeCarga}</p>
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (session && !userData) {
    return <div style={{ padding: 20 }}>Cargando perfil...</div>
  }

  if (!session) {
    return (
      <div style={{ padding: 20, maxWidth: '400px', margin: '80px auto', fontFamily: 'sans-serif' }}>
        <h1 style={{ color: '#2c3e50' }}>CRIN</h1>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '6px', border: '1px solid #ccc' }} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" style={{ width: '100%', padding: '10px', marginBottom: '20px', borderRadius: '6px', border: '1px solid #ccc' }} />
        <button onClick={login} style={{ width: '100%', padding: '12px', background: '#2c3e50', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Ingresar</button>
      </div>
    )
  }

  if (!modoSeleccionado) {
    return (
      <div style={{ backgroundColor: '#000', minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: '420px', width: '100%', padding: '20px', textAlign: 'center' }}>
          <h2>Hola, {userData?.nombre || 'Usuario'}</h2>
          <p style={{ color: '#aaa', marginBottom: '25px' }}>Seleccioná a dónde deseas ingresar:</p>
          
          <div style={{ display: 'grid', gap: '15px' }}>
            <button 
              onClick={() => setModoSeleccionado('app')} 
              style={{ padding: '15px', background: '#111', color: '#fff', border: '1px solid #333', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              🚀 Continuar con la App
            </button>
            
            <button 
              onClick={handleAccesoSistemaCrin} 
              style={{ padding: '15px', background: '#111', color: '#fff', border: '1px solid #00f2ff', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              💻 Acceder a Sistema Crin
            </button>
          </div>

          {/* PANEL EMULADOR DE FECHA & MOTOR */}
          <div style={{ marginTop: '25px', padding: '15px', background: '#1a1a1a', border: '1px dashed #00f2ff', borderRadius: '10px', width: '100%', textAlign: 'left', boxSizing: 'border-box' }}>
            <p style={{ color: '#00f2ff', fontSize: '13px', margin: '0 0 8px 0', fontWeight: 'bold' }}>🛠️ Simulador de Fecha y Facturación</p>
            
            <label style={{ fontSize: '11px', color: '#aaa', display: 'block', marginBottom: '3px' }}>Fecha de Trabajo del Sistema:</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input 
                type="date" 
                value={fechaSimuladaInput}
                onChange={(e) => setFechaSimuladaInput(e.target.value)}
                style={{ flex: 1, padding: '6px', borderRadius: '5px', background: '#222', color: '#fff', border: '1px solid #444', fontSize: '13px' }}
              />
              <button 
                onClick={() => {
                  localStorage.setItem('crin_fecha_trabajo_simulada', fechaSimuladaInput);
                  alert(`¡Fecha de trabajo fijada a: ${fechaSimuladaInput}!`);
                }}
                style={{ padding: '6px 12px', background: '#00f2ff', color: '#000', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}
              >
                Fijar
              </button>
            </div>

            <label style={{ fontSize: '11px', color: '#aaa', display: 'block', marginBottom: '3px' }}>% de Aumento Opcional para el Ciclo:</label>
            <input 
              type="number" 
              value={porcentajeAumentoInput}
              onChange={(e) => setPorcentajeAumentoInput(e.target.value)}
              placeholder="Ej: 10"
              style={{ width: '100%', padding: '6px', borderRadius: '5px', background: '#222', color: '#fff', border: '1px solid #444', fontSize: '13px', marginBottom: '12px', boxSizing: 'border-box' }}
            />

            <button 
              onClick={() => {
                localStorage.removeItem('crin_fecha_trabajo_simulada');
                setFechaSimuladaInput(new Date().toISOString().split('T')[0]);
                setPorcentajeAumentoInput('0');
                alert('Simulación reseteada a fecha real.');
              }}
              style={{ background: 'none', border: 'none', color: '#ff6b6b', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline', width: '100%', textAlign: 'center' }}
            >
              Restablecer fecha real
            </button>
          </div>

          <button onClick={logout} style={{ marginTop: '25px', background: 'none', color: '#ff4444', border: '1px solid #ff4444', padding: '10px', width: '100%', cursor: 'pointer', borderRadius: '5px' }}>
            Cerrar Sesión
          </button>
        </div>
      </div>
    )
  }

  if (modoSeleccionado === 'crin') {
    const handleAccionClick = async (accion) => {
      setCrinAccion(accion)
      setBusquedaPaciente('')
      setPacienteSeleccionado(null) 
      if (['EDITAR_PACIENTE', 'NUEVO_ACUERDO'].includes(accion)) {
        await cargarPacientesParaListar()
      }
    }

    return (
      <div style={{ backgroundColor: '#f0f4f8', minHeight: '100vh', color: '#333333', padding: '40px 20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        <div style={{ width: '100%', maxWidth: '700px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <button 
            onClick={() => { 
              if (pacienteSeleccionado) {
                setPacienteSeleccionado(null)
              } else if (crinAccion) {
                setCrinAccion(null)
                setListaPacientes([])
              } else {
                setModoSeleccionado(null)
              }
            }} 
            style={{ background: '#ffffff', color: '#4a5568', border: '1px solid #cbd5e0', padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', transition: 'all 0.2s' }}
          >
            ← Volver
          </button>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '24px', color: '#1a365d', fontWeight: '800', letterSpacing: '0.5px' }}>✨ Sistema Crin</h2>
          </div>
        </div>

        {crinAccion === 'NUEVO_PACIENTE' && (
          <div style={{ width: '100%', maxWidth: '900px' }}>
            <FormularioPaciente onVolver={() => setCrinAccion(null)} />
          </div>
        )}

        {crinAccion === 'EDITAR_PACIENTE' && !pacienteSeleccionado && (
          <div style={{ width: '100%', maxWidth: '600px', background: '#ffffff', padding: '30px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px rgba(0,0,0,0.08)' }}>
            <h3 style={{ marginTop: 0, color: '#2b6cb0', fontSize: '20px', marginBottom: '15px' }}>🔍 Seleccioná el paciente a editar</h3>
            <input 
              type="text" 
              placeholder="Buscar por nombre o DNI..." 
              value={busquedaPaciente}
              onChange={(e) => setBusquedaPaciente(e.target.value)}
              style={{ width: '100%', padding: '12px', marginBottom: '20px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none' }}
            />
            {cargandoPacientes ? (
              <p style={{ textAlign: 'center', color: '#666' }}>Cargando pacientes...</p>
            ) : (
              <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {listaPacientes
                  .filter(p => 
                    (p.nombre_apellido && p.nombre_apellido.toLowerCase().includes(busquedaPaciente.toLowerCase())) ||
                    (p.dni && p.dni.includes(busquedaPaciente))
                  )
                  .map((paciente) => (
                    <div 
                      key={paciente.id || paciente.id_paciente}
                      onClick={() => setPacienteSeleccionado(paciente)}
                      style={{ padding: '14px 18px', background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <span style={{ fontWeight: '600', color: '#2d3748' }}>👤 {paciente.nombre_apellido}</span>
                      <span style={{ fontSize: '13px', color: '#718096', background: '#edf2f7', padding: '4px 8px', borderRadius: '6px' }}>DNI: {paciente.dni || 'S/D'}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {crinAccion === 'EDITAR_PACIENTE' && pacienteSeleccionado && (
          <div style={{ width: '100%', maxWidth: '900px' }}>
            <FormularioPaciente 
              pacienteAEditar={pacienteSeleccionado}
              onVolver={() => { setPacienteSeleccionado(null); setCrinAccion(null); }} 
            />
          </div>
        )}

        {crinAccion === 'NUEVO_ACUERDO' && !pacienteSeleccionado && (
          <div style={{ width: '100%', maxWidth: '600px', background: '#ffffff', padding: '30px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px rgba(0,0,0,0.08)' }}>
            <h3 style={{ marginTop: 0, color: '#22543d', fontSize: '20px', marginBottom: '15px' }}>🤝 Seleccioná el paciente para el Nuevo Acuerdo</h3>
            <input 
              type="text" 
              placeholder="Buscar por nombre o DNI..." 
              value={busquedaPaciente}
              onChange={(e) => setBusquedaPaciente(e.target.value)}
              style={{ width: '100%', padding: '12px', marginBottom: '20px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none' }}
            />
            {cargandoPacientes ? (
              <p style={{ textAlign: 'center', color: '#666' }}>Cargando pacientes...</p>
            ) : (
              <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {listaPacientes
                  .filter(p => 
                    (p.nombre_apellido && p.nombre_apellido.toLowerCase().includes(busquedaPaciente.toLowerCase())) ||
                    (p.dni && p.dni.includes(busquedaPaciente))
                  )
                  .map((paciente) => (
                    <div 
                      key={paciente.id || paciente.id_paciente}
                      onClick={() => setPacienteSeleccionado(paciente)}
                      style={{ padding: '14px 18px', background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <span style={{ fontWeight: '600', color: '#2d3748' }}>👤 {paciente.nombre_apellido}</span>
                      <span style={{ fontSize: '13px', color: '#718096', background: '#edf2f7', padding: '4px 8px', borderRadius: '6px' }}>DNI: {paciente.dni || 'S/D'}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {crinAccion === 'NUEVO_ACUERDO' && pacienteSeleccionado && (
          <div style={{ width: '100%', maxWidth: '900px' }}>
            <FormularioAcuerdo 
              paciente={pacienteSeleccionado} 
              onVolver={() => { setPacienteSeleccionado(null); setCrinAccion(null); }} 
            />
          </div>
        )}

        {crinAccion === 'FICHA_PACIENTE' && (
          <div style={{ width: '100%', maxWidth: '950px' }}>
             <FichaPaciente 
               onVolver={() => setCrinAccion(null)} 
               usuario={userData?.nombre || session?.user?.email || 'Usuario'} 
             />
          </div>
        )}

        {crinAccion === 'SIMULADOR_MORA' && (
          <div style={{ width: '100%', maxWidth: '900px' }}>
            <SimuladorMotorMora />
          </div>
        )}

        {!crinAccion && (
          <div style={{ width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', gap: '20px', width: '100%' }}>
              <button 
                onClick={() => handleAccionClick('NUEVO_PACIENTE')}
                style={{ flex: 1, padding: '28px 15px', background: 'linear-gradient(135deg, #ebf8ff 100%, #bee3f8 0%)', color: '#2b6cb0', border: '2px solid #90cdf4', borderRadius: '20px', cursor: 'pointer', fontWeight: '800', fontSize: '15px', textAlign: 'center' }}
              >
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>➕👤</div>
                NUEVO PACIENTE
              </button>
              
              <button 
                onClick={() => handleAccionClick('EDITAR_PACIENTE')}
                style={{ flex: 1, padding: '28px 15px', background: 'linear-gradient(135deg, #e6fffa 100%, #b2f5ea 0%)', color: '#234e52', border: '2px solid #81e6d9', borderRadius: '20px', cursor: 'pointer', fontWeight: '800', fontSize: '15px', textAlign: 'center' }}
              >
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>✏️👤</div>
                EDITAR PACIENTE
              </button>
            </div>

            <button 
              onClick={() => handleAccionClick('NUEVO_ACUERDO')}
              style={{ width: '100%', padding: '26px 20px', background: 'linear-gradient(135deg, #e6fffa 100%, #c6f6d5 0%)', color: '#22543d', border: '2px solid #9ae6b4', borderRadius: '20px', cursor: 'pointer', fontWeight: '800', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px' }}
            >
              <span style={{ fontSize: '28px' }}>🤝📄</span>
              NUEVO ACUERDO
            </button>

            <button 
              onClick={() => handleAccionClick('FICHA_PACIENTE')}
              style={{ width: '100%', padding: '26px 20px', background: 'linear-gradient(135deg, #fffaf0 100%, #feebc8 0%)', color: '#744210', border: '2px solid #fbd38d', borderRadius: '20px', cursor: 'pointer', fontWeight: '800', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px' }}
            >
              <span style={{ fontSize: '28px' }}>📂📋</span>
              FICHA PACIENTE
            </button>

            <button 
              onClick={() => handleAccionClick('SIMULADOR_MORA')}
              style={{ width: '100%', padding: '26px 20px', background: 'linear-gradient(135deg, #f3e8ff 100%, #e9d5ff 0%)', color: '#6b21a8', border: '2px solid #d8b4fe', borderRadius: '20px', cursor: 'pointer', fontWeight: '800', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px' }}
            >
              <span style={{ fontSize: '28px' }}>🧪⚡</span>
              SIMULADOR MOTOR DE MORA
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
      <button 
        onClick={() => setModoSeleccionado(null)} 
        style={{ position: 'fixed', top: '10px', right: '10px', zIndex: 9999, background: '#222', color: '#aaa', border: '1px solid #444', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}
      >
        Cambiar Modo
      </button>
      <Layout userData={userData} logout={logout} />
    </div>
  )
}

export default App