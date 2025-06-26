import { useState, useEffect } from 'react';
import axios from 'axios';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import './index.css';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

const Dashboard = () => {
  const [issues, setIssues] = useState([]);
  const [trivyAlerts, setTrivyAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const GITHUB_TOKEN = process.env.REACT_APP_GITHUB_TOKEN;
  const REPO = 'KhoaHoang01012003/gh-actions-NodejsWebApp';

  const fetchIssues = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`https://api.github.com/repos/${REPO}/issues`, {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      setIssues(response.data);
    } catch (err) {
      setError('Failed to fetch issues: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrivyAlerts = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`https://api.github.com/repos/${REPO}/code-scanning/alerts?tool_name=Trivy`, {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      setTrivyAlerts(response.data);
    } catch (err) {
      setError('Failed to fetch Trivy alerts: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (GITHUB_TOKEN) {
      fetchIssues();
      fetchTrivyAlerts();
    } else {
      setError('GitHub token is missing');
    }
  }, []);

  // Process SCA data
  const scaIssues = issues.filter(issue => issue.title === 'npm audit found vulnerabilities');
  const scaData = scaIssues.map(issue => {
    const match = issue.body?.match(/Found (\d+) vulnerabilities \((\d+) critical, (\d+) high, (\d+) moderate, (\d+) low\)/i);
    return {
      title: issue.title,
      body: issue.body,
      created_at: issue.created_at,
      critical: match ? parseInt(match[2]) : 0,
      high: match ? parseInt(match[3]) : 0,
      moderate: match ? parseInt(match[4]) : 0,
      low: match ? parseInt(match[5]) : 0,
    };
  });

  // Process Falco data
  const falcoIssues = issues.filter(issue => issue.title.startsWith('Falco Logs for CI run'));
  const falcoData = falcoIssues.map(issue => {
    const warnings = (issue.body?.match(/(WARNING|ERROR|CRITICAL)/g) || []).length;
    return {
      title: issue.title,
      body: issue.body,
      created_at: issue.created_at,
      warnings,
    };
  });

  // Process ZAP data
  const zapIssues = issues.filter(issue => issue.title === 'ZAP Scan Report');
  const zapData = zapIssues.map(issue => {
    const match = issue.body?.match(/FAIL-NEW: (\d+)\s+FAIL-INPROG: (\d+)\s+WARN-NEW: (\d+)\s+WARN-INPROG: (\d+)/i);
    return {
      title: issue.title,
      body: issue.body,
      created_at: issue.created_at,
      fail_new: match ? parseInt(match[1]) : 0,
      fail_inprog: match ? parseInt(match[2]) : 0,
      warn_new: match ? parseInt(match[3]) : 0,
      warn_inprog: match ? parseInt(match[4]) : 0,
    };
  });

  // Process Trivy data
  const trivyData = trivyAlerts.map(alert => ({
    rule: alert.rule.description,
    severity: alert.rule.security_severity_level || 'unknown',
    created_at: alert.created_at,
  }));

  // Data for Bar Chart
  const severityChartData = {
    labels: ['Critical', 'High', 'Medium', 'Low'],
    datasets: [
      {
        label: 'Trivy (Container Image)',
        data: [
          trivyData.filter(d => d.severity === 'critical').length,
          trivyData.filter(d => d.severity === 'high').length,
          trivyData.filter(d => d.severity === 'medium').length,
          trivyData.filter(d => d.severity === 'low').length,
        ],
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      },
      {
        label: 'ZAP (DAST)',
        data: [
          zapData.reduce((sum, d) => sum + d.fail_new, 0),
          zapData.reduce((sum, d) => sum + d.warn_new, 0),
          0,
          0,
        ],
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
      },
      {
        label: 'SCA (npm audit)',
        data: [
          scaData.reduce((sum, d) => sum + d.critical, 0),
          scaData.reduce((sum, d) => sum + d.high, 0),
          scaData.reduce((sum, d) => sum + d.moderate, 0),
          scaData.reduce((sum, d) => sum + d.low, 0),
        ],
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
      },
    ],
  };

  // Data for Line Chart
  const trendChartData = {
    labels: [...new Set([...scaData, ...falcoData, ...zapData, ...trivyData].map(d => new Date(d.created_at).toLocaleDateString()))].sort(),
    datasets: [
      {
        label: 'Total Vulnerabilities',
        data: [...new Set([...scaData, ...falcoData, ...zapData, ...trivyData].map(d => new Date(d.created_at).toLocaleDateString()))].sort().map(date => {
          return (
            scaData.filter(d => new Date(d.created_at).toLocaleDateString() === date).reduce((sum, d) => sum + d.critical + d.high + d.moderate + d.low, 0) +
            falcoData.filter(d => new Date(d.created_at).toLocaleDateString() === date).reduce((sum, d) => sum + d.warnings, 0) +
            zapData.filter(d => new Date(d.created_at).toLocaleDateString() === date).reduce((sum, d) => sum + d.fail_new + d.warn_new, 0) +
            trivyData.filter(d => new Date(d.created_at).toLocaleDateString() === date).length
          );
        }),
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
      },
    ],
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4">CI/CD Security Dashboard</h1>
      {loading && <p className="text-blue-500">Loading data...</p>}
      {error && <p className="text-red-500 font-bold">{error}</p>}
      {!loading && !error && issues.length === 0 && trivyAlerts.length === 0 && (
        <p className="text-yellow-500">No data available. Please check repository issues and code scanning alerts.</p>
      )}

      {/* Refresh Button */}
      <button
        onClick={() => { fetchIssues(); fetchTrivyAlerts(); }}
        className="mb-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Refresh Data
      </button>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-xl font-semibold">SCA (npm audit)</h2>
          <p>Total Vulnerabilities: {scaData.reduce((sum, d) => sum + d.critical + d.high + d.moderate + d.low, 0)}</p>
          <p>Critical: {scaData.reduce((sum, d) => sum + d.critical, 0)}</p>
          <p>High: {scaData.reduce((sum, d) => sum + d.high, 0)}</p>
        </div>
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-xl font-semibold">Falco (Runtime Security)</h2>
          <p>Total Warnings: {falcoData.reduce((sum, d) => sum + d.warnings, 0)}</p>
        </div>
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-xl font-semibold">Trivy (Container Image)</h2>
          <p>Total Alerts: {trivyData.length}</p>
          <p>Critical: {trivyData.filter(d => d.severity === 'critical').length}</p>
        </div>
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-xl font-semibold">ZAP (DAST)</h2>
          <p>Fail New: {zapData.reduce((sum, d) => sum + d.fail_new, 0)}</p>
          <p>Warn New: {zapData.reduce((sum, d) => sum + d.warn_new, 0)}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div>
          <h2 className="text-xl font-semibold mb-2">Vulnerability Severity</h2>
          <Bar data={severityChartData} />
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-2">Vulnerability Trend</h2>
          <Line data={trendChartData} />
        </div>
      </div>

      {/* Detailed Tables */}
      <div>
        <h2 className="text-xl font-semibold mb-2">Detailed Reports</h2>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">SCA (npm audit)</h3>
          <table className="w-full border-collapse border">
            <thead>
              <tr className="bg-gray-200">
                <th className="border p-2">Issue Title</th>
                <th className="border p-2">Critical</th>
                <th className="border p-2">High</th>
                <th className="border p-2">Moderate</th>
                <th className="border p-2">Low</th>
                <th className="border p-2">Created At</th>
              </tr>
            </thead>
            <tbody>
              {scaData.map((item, index) => (
                <tr key={index}>
                  <td className="border p-2">{item.title}</td>
                  <td className="border p-2">{item.critical}</td>
                  <td className="border p-2">{item.high}</td>
                  <td className="border p-2">{item.moderate}</td>
                  <td className="border p-2">{item.low}</td>
                  <td className="border p-2">{new Date(item.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Falco (Runtime Security)</h3>
          <table className="w-full border-collapse border">
            <thead>
              <tr className="bg-gray-200">
                <th className="border p-2">Issue Title</th>
                <th className="border p-2">Warnings</th>
                <th className="border p-2">Created At</th>
              </tr>
            </thead>
            <tbody>
              {falcoData.map((item, index) => (
                <tr key={index}>
                  <td className="border p-2">{item.title}</td>
                  <td className="border p-2">{item.warnings}</td>
                  <td className="border p-2">{new Date(item.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Trivy (Container Image)</h3>
          <table className="w-full border-collapse border">
            <thead>
              <tr className="bg-gray-200">
                <th className="border p-2">Rule Description</th>
                <th className="border p-2">Severity</th>
                <th className="border p-2">Created At</th>
              </tr>
            </thead>
            <tbody>
              {trivyData.map((item, index) => (
                <tr key={index}>
                  <td className="border p-2">{item.rule}</td>
                  <td className="border p-2">{item.severity}</td>
                  <td className="border p-2">{new Date(item.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="text-lg font-semibold">ZAP (DAST)</h3>
          <table className="w-full border-collapse border">
            <thead>
              <tr className="bg-gray-200">
                <th className="border p-2">Issue Title</th>
                <th className="border p-2">Fail New</th>
                <th className="border p-2">Warn New</th>
                <th className="border p-2">Created At</th>
              </tr>
            </thead>
            <tbody>
              {zapData.map((item, index) => (
                <tr key={index}>
                  <td className="border p-2">{item.title}</td>
                  <td className="border p-2">{item.fail_new}</td>
                  <td className="border p-2">{item.warn_new}</td>
                  <td className="border p-2">{new Date(item.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;