import './App.css'
import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import LandingPage from './pages/LandingPage'
import Authentication from './pages/Authentication'
import { AuthProvider } from './context/AuthContext'
import VideoMeetComponent from './pages/VideoMeet'
import Home from './pages/Home'
import History from './pages/History'

function App() {
  return (
    <div className="App">
      <Router>
        <AuthProvider>
          <Routes>
            <Route path='/' element={<LandingPage />}></Route>
            <Route path='/auth' element={<Authentication />}></Route>
            <Route path='/home' element={<Home />}></Route>
            <Route path='/history' element={<History />}></Route>
            <Route path='/:url' element={<VideoMeetComponent />}></Route>
          </Routes>
        </AuthProvider>
      </Router>
    </div>
  )
}

export default App
