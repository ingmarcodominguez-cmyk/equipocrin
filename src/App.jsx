import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import Layout from './components/Layout.jsx'

function App() {
  const [session, setSession] = useState(null)
  const [userData, setUserData] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) cargarPerfil(data.session.user.id)
      else setCargando(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) cargarPerfil(session.user.id)
      else { setUserData(null); setCargando(false); }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function cargarPerfil(userId) {
    setCargando(true)
    const { data: perfil } = await supabase.from('users').select('*').eq('id', userId).single()
    setUserData(perfil)
    setCargando(false)
  }

  async function login() {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) alert('Login incorrecto: ' + error.message)
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.reload()
  }

  if (cargando) return <div style={{ padding: 20 }}>Cargando sistema...</div>

  // agregado por chat gpt 
if (
  session
  &&
  !userData
) {

  return (
    <div
      style={{
        padding: 20
      }}
    >
      Cargando perfil...
    </div>
  )
}



  // LOGIN (Mantenemos el padding aquí para que el formulario se vea bien)
  if (!session) {
    return (
      <div style={{ padding: 20 }}>
        <h1>CRIN</h1>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        <br /><br />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <br /><br />
        <button onClick={login}>Ingresar</button>
      </div>
    )
  }

  // SISTEMA: Quitamos el padding: 20 para que el Layout ocupe el 100% de la pantalla
  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
      <Layout userData={userData} logout={logout} />
    </div>
  )
}

export default App

