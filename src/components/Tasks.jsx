
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

  }, [])

  async function cargarTasks() {

    const {

      data,

      error

    } = await supabase

      .from('tasks')

      .select('*')

      .order(
        'created_at',
        {
          ascending: false
        }
      )

    console.log(error)

    if (data) {

      setTasks(data)
    }
  }

  async function cargarUsuarios() {

    const {

      data,

      error

    } = await supabase

      .from('users')

      .select('*')

    console.log(error)

    if (data) {

      setUsers(data)
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
          asignado,

        estado:
          'pendiente',

        creado_por:
          userData?.id
      }])

    console.log(error)

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
          respuestas[id],

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

  function nombreUsuario(

    id

  ) {

    return users.find(

      (u) =>
        u.id == id

    )?.nombre || ''
  }

  return (

    <div>

      <h1>

        Tareas

      </h1>

      <div
        style={{
          marginBottom: 30
        }}
      >

        <textarea

          placeholder="
          Descripción
          de la tarea
          "

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

            users.map((u) => (

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

        <button
          onClick={crearTask}
        >

          Crear tarea

        </button>

      </div>

      {

        tasks.map((t) => (

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
                nombreUsuario(
                  t.asignado_a
                )
              }

            </p>

            <p>

              <strong>

                Encargado por:

              </strong>

              {' '}

              {
                nombreUsuario(
                  t.creado_por
                )
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

            {

              t.estado !==
                'completada'

              &&

              <div>

                <textarea

                  placeholder="
                  Respuesta breve
                  "

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
            }

          </div>
        ))
      }

    </div>
  )
}

export default Tasks

