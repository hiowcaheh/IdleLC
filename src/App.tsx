import { Route, Routes } from 'react-router'
import { HomePage } from './ui/HomePage.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<HomePage />} />
    </Routes>
  )
}
