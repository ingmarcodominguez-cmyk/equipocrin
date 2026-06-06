
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

  }, [])

  async function cargarTasks() {

    const { data } =

      await supabase

        .from('tasks')

        .select('*')

        .order(
          'created_at',
          {
            ascending: false
          }
        )

    if (data) {

      setTasks(data)
    }
  }

  async function cargarUsuarios() {

    const { data } =

      await supabase

        .from('users')

        .select('*')

    if (data) {

      setUsers(data)
    }
  }

  async function crearTask() {

    if (!descripcion)
      return

    await supabase

      .from('tasks')

      .insert([{

        descripcion,

        asignado_a:
          asignado,

        estado:
          'pendiente'
      }])

    setDescripcion('')

    cargarTasks()
  }

  async function responderTask(

    id

  ) {

    await supabase

      .from('tasks')

      .update({

        respuesta:
          respuestas[id],

        estado:
          'realizada'
      })

      .eq(
        'id',
        id
      )

    cargarTasks()
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
          marginBottom: 20
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

            minHeight: 80
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

              borderRadius: 10,

              padding: 15,

              marginBottom: 15
            }}
          >

            <p>

              <strong>

                {
                  nombreUsuario(
                    t.asignado_a
                  )
                }

              </strong>

            </p>

            <p>

              {
                t.descripcion
              }

            </p>

            <p>

              Estado:
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
                'realizada'

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

                    minHeight: 60
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

