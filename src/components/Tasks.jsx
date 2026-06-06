import {
  useEffect,
  useState
} from 'react'
import {
  supabase
} from '../lib/supabase.js'

function Tasks({
  userData
}) {
  const [
    tasks,
    setTasks
  ] = useState([])
  const [
    descripcion,
    setDescripcion
  ] = useState('')
  
  const [
    fechaVencimiento,
    setFechaVencimiento
  ] = useState('')

  const [
    asignado,
    setAsignado
  ] = useState('')
  const [
    users,
    setUsers
  ] = useState([])
  const [
    respuestas,
    setRespuestas
  ] = useState({})

  useEffect(() => {
    if (!userData?.id) return

    cargarTasks()
    cargarUsuarios()

    const intervalo =
      setInterval(() => {
        cargarTasks()
      }, 3000)

    return () =>
      clearInterval(
        intervalo
      )
  }, [userData])

  async function cargarTasks() {
    if (!userData?.id) return

    try {
      let query = supabase.from('tasks').select('*')
      
      // Convertimos a mayúsculas para que coincida exactamente con Supabase (PROFESIONAL, ADMINISTRACION, etc.)
      const rolUsuario = (userData?.rol || userData?.role || '')?.toUpperCase()

      // LÓGICA DE ROLES MEJORADA:
      // Si NO es ADMINISTRACION y NO es DIRECCION, se le limita la vista a sus tareas
      if (rolUsuario !== 'ADMINISTRACION' && rolUsuario !== 'DIRECCION') {
        query = query.or(`creado_por.eq."${userData.id}",asignado_a.eq."${userData.id}"`)
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) {
        console.error("Error al filtrar tareas:", error)
      }
      
      if (data) {
        setTasks(data)
      }
    } catch (err) {
      console.error("Error crítico en cargarTasks:", err)
    }
  }

  async function cargarUsuarios() {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
      if (data) {
        setUsers(data)
      }
    } catch (err) {
      console.error("Error al cargar usuarios:", err)
    }
  }

  async function crearTask() {
    if (!descripcion)
      return

    const {
      error
    } = await supabase
      .from('tasks')
      .insert([{
        descripcion,
        asignado_a:
          asignado || null,
        estado:
          'pendiente',
        fecha_vencimiento:
          fechaVencimiento || null,
        creado_por:
          userData?.id || null
      }])

    if (error) {
      alert(
        'Error al crear tarea'
      )
    } else {
      alert(
        'Tarea creada'
      )
      setDescripcion('')
      setAsignado('')
      setFechaVencimiento('')
      await cargarTasks()
    }
  }

  async function responderTask(
    id
  ) {
    const {
      error
    } = await supabase
      .from('tasks')
      .update({
        respuesta:
          respuestas[id] || '',
        estado:
          'completada'
      })
      .eq(
        'id',
        id
      )

    if (error) {
      alert(
        JSON.stringify(
          error
        )
      )
    } else {
      alert(
        'Respuesta enviada'
      )
      setRespuestas({
        ...respuestas,
        [id]: ''
      })
      await cargarTasks()
    }
  }

  function nombreUsuario(id) {
    if (!id || !users || users.length === 0) return 'No asignado'
    const usuarioEncontrado = users.find((u) => String(u.id) === String(id))
    return usuarioEncontrado?.nombre || 'Usuario no encontrado'
  }

  return (
    <div>
      <h1>
        Tareas
      </h1>

      {/* FORMULARIO DE CREACIÓN */}
      <div
        style={{
          marginBottom: 30
        }}
      >
        <textarea
          placeholder="Descripción de la tarea"
          value={descripcion}
          onChange={(e) =>
            setDescripcion(
              e.target.value
            )
          }
          style={{
            width: '100%',
            minHeight: 100,
            padding: 10,
            borderRadius: 10
          }}
        />

        <br /><br />

        <select
          value={asignado}
          onChange={(e) =>
            setAsignado(
              e.target.value
            )
          }
          style={{
            padding: 10,
            borderRadius: 10
          }}
        >
          <option value="">
            Asignar a
          </option>
          {
            Array.isArray(users) && users.map((u) => (
              <option
                key={u.id}
                value={u.id}
              >
                {u.nombre}
              </option>
            ))
          }
        </select>

        <br /><br />

        <p>
          Fecha de vencimiento
        </p>

        <input
          type="date"
          value={fechaVencimiento}
          onChange={(e) =>
            setFechaVencimiento(
              e.target.value
            )
          }
          style={{
            padding: 10,
            borderRadius: 10
          }}
        />

        <br /><br />

        <button
          onClick={crearTask}
        >
          Crear tarea
        </button>
      </div>

      {/* AVISO VISUAL SI NO HAY TAREAS */}
      {tasks.length === 0 && (
        <div style={{ 
          padding: 15, 
          backgroundColor: '#f1f5f9', 
          borderRadius: 10, 
          textAlign: 'center', 
          color: '#64748b',
          marginBottom: 20,
          fontStyle: 'italic'
        }}>
          No tenés tareas asignadas ni creadas pendientes en este momento.
        </div>
      )}

      {/* LISTADO DE TARJETAS DE TAREAS */}
      {
        Array.isArray(tasks) && tasks.map((t) => (
          <div
            key={t.id}
            style={{
              border:
                '1px solid #ccc',
              borderRadius: 12,
              padding: 15,
              marginBottom: 20,
              backgroundColor:
                t.estado ===
                'completada'
                ? '#dcfce7'
                : '#ffffff'
            }}
          >
            <p>
              <strong>
                Asignado a:
              </strong>
              {' '}
              {
                nombreUsuario(t.asignado_a)
              }
            </p>

            <p>
              <strong>
                Encargado por:
              </strong>
              {' '}
              {
                nombreUsuario(t.creado_por)
              }
            </p>

            <p>
              {
                t.descripcion
              }
            </p>

            <p>
              <strong>
                Estado:
              </strong>
              {' '}
              {
                t.estado
              }

              {
                t.estado !== 'completada'
                && t.fecha_vencimiento
                && new Date(t.fecha_vencimiento) < new Date()
                && (
                  <span
                    style={{
                      color: 'red',
                      marginLeft: 10,
                      fontWeight: 'bold'
                    }}
                  >
                    VENCIDA
                  </span>
                )
              }
            </p>

            {
              t.respuesta
              &&
              <div>
                <strong>
                  Respuesta:
                </strong>
                <p>
                  {
                    t.respuesta
                  }
                </p>
              </div>
            }

            {/* CONTROL DE INTERFAZ ESTRICTO */}
            {
              t.estado !== 'completada'
              ? (
                  userData?.id && String(userData.id) === String(t.asignado_a) 
                  ? (
                    <div>
                      <textarea
                        placeholder="Respuesta breve"
                        value={
                          respuestas[t.id]
                          || ''
                        }
                        onChange={(e) =>
                          setRespuestas({
                            ...respuestas,
                            [t.id]:
                              e.target.value
                          })
                        }
                        style={{
                          width: '100%',
                          minHeight: 80,
                          marginTop: 10,
                          padding: 10,
                          borderRadius: 10
                        }}
                      />

                      <br /><br />

                      <button
                        onClick={() =>
                          responderTask(
                            t.id
                          )
                        }
                      >
                        Responder
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 15, color: '#64748b', fontSize: 13, fontStyle: 'italic' }}>
                      Pendiente de respuesta por parte del integrante asignado.
                    </div>
                  )
              ) : (
                <div style={{ marginTop: 15, color: '#16a34a', fontSize: 13, fontStyle: 'italic' }}>
                  ✓ Tarea completada exitosamente.
                </div>
              )
            }

          </div>
        ))
      }

    </div>
  )
}

export default Tasks