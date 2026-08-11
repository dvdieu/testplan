import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import IndexPage from './IndexPage.jsx';
import PlannerPage from './PlannerPage.jsx';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<IndexPage />} />
        <Route path="/plan/:projectName" element={<PlannerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
