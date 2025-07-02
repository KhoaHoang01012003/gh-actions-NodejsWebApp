import { useState, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './index.css';
import JSZip from 'jszip';

// Hàm phân tích báo cáo thô để hiển thị có cấu trúc
const parseRawNpmAuditReport = (commentBody) => {
  const blocks = [];
  const lines = commentBody.split('\n');
  let currentBlock = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const packageMatch = line.match(/^([a-zA-Z0-9-_]+)\s+(.+)$/);
    if (packageMatch && line !== '# npm audit report') {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = {
        package: packageMatch[1],
        version: packageMatch[2],
        severity: '',
        description: '',
        advisory: [],
        fix: '',
        dependencies: [],
      };
      continue;
    }

    const severityMatch = line.match(/^Severity: (\w+)$/i);
    if (severityMatch && currentBlock) {
      currentBlock.severity = severityMatch[1].toLowerCase();
      continue;
    }

    const advisoryMatch = line.match(/^(.+) - (https:\/\/github\.com\/advisories\/[a-zA-Z0-9-_]+)/);
    if (advisoryMatch && currentBlock) {
      currentBlock.description = advisoryMatch[1];
      currentBlock.advisory.push(advisoryMatch[2]);
      continue;
    }

    const fixMatch = line.match(/^fix available via `npm audit fix.*$/);
    if (fixMatch && currentBlock) {
      currentBlock.fix = fixMatch[0];
      continue;
    }

    const breakingMatch = line.match(/^Will install.*$/);
    if (breakingMatch && currentBlock) {
      currentBlock.fix += `\n${breakingMatch[0]}`;
      continue;
    }

    const moduleMatch = line.match(/^node_modules\/(.+)$/);
    if (moduleMatch && currentBlock) {
      currentBlock.dependencies.push(moduleMatch[1]);
      continue;
    }

    const depMatch = line.match(/^\s+([a-zA-Z0-9-_]+)\s+(.+)$/);
    if (depMatch && currentBlock) {
      currentBlock.dependencies.push(`${depMatch[1]} ${depMatch[2]}`);
      continue;
    }
  }

  if (currentBlock) blocks.push(currentBlock);
  return blocks;
};

const Dashboard = () => {
  const [issues, setIssues] = useState([]);
  const [trivyAlerts, setTrivyAlerts] = useState([]);
  const [scaData, setScaData] = useState([]);
  const [scaRawReports, setScaRawReports] = useState([]);
  const [zapReport, setZapReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedReports, setExpandedReports] = useState({});
  const [expandedTrivyDetails, setExpandedTrivyDetails] = useState({});

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8002';
  const GITHUB_API_URL = 'https://api.github.com';
  const GITHUB_OWNER = 'KhoaHoang01012003';
  const GITHUB_REPO = 'gh-actions-NodejsWebApp';
  const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN || '';

  const fetchIssues = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/api/issues`, {
        headers: { 'Accept': 'application/vnd.github+json' }
      });
      console.log('Fetched Issues:', response.data);
      setIssues(response.data);
    } catch (err) {
      console.error('Fetch Issues Error:', err.response?.data || err.message);
      setError(`Không thể lấy danh sách issue: ${err.response?.status} ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchIssueComments = async (issueNumber) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/issues/${issueNumber}/comments`, {
        headers: { 'Accept': 'application/vnd.github+json' }
      });
      return response.data;
    } catch (err) {
      console.error(`Lỗi lấy bình luận cho issue ${issueNumber}:`, err.response?.data || err.message);
      setError(`Không thể lấy bình luận: ${err.response?.status} ${err.response?.data?.error || err.message}`);
      return [];
    }
  };

  const fetchTrivyAlerts = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/api/code-scanning/alerts`, {
        headers: { 'Accept': 'application/vnd.github+json' }
      });
      const openAlerts = response.data.filter(alert => alert.state === 'open');
      console.log('Open Trivy Alerts:', openAlerts);
      setTrivyAlerts(openAlerts);
    } catch (err) {
      console.error('Lỗi lấy cảnh báo Trivy:', err.response?.data || err.message);
      setError(`Không thể lấy cảnh báo Trivy: ${err.response?.status} ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchZapReport = async (runId) => {
    try {
      const artifactsUrl = `${GITHUB_API_URL}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}/artifacts`;
      console.log('Fetching Artifacts from:', artifactsUrl);
      const response = await axios.get(artifactsUrl, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      console.log('Fetched Artifacts:', response.data);
      const zapArtifact = response.data.artifacts?.find(artifact => artifact.name.toLowerCase() === 'zap_scan');
      if (!zapArtifact) {
        throw new Error(`Không tìm thấy artifact zap_scan trong Run ID: ${runId}`);
      }
      console.log('ZAP Artifact:', zapArtifact);
      const reportResponse = await axios.get(zapArtifact.archive_download_url, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28'
        },
        responseType: 'arraybuffer'
      });
      console.log('ZAP Artifact Response:', {
        status: reportResponse.status,
        headers: reportResponse.headers,
        size: reportResponse.data.byteLength
      });

      const zip = await JSZip.loadAsync(reportResponse.data);
      // Thử các tên file có thể
      const possibleFileNames = ['report_md.md', 'report.md', 'zap_report.md', 'zap_scan.md'];
      let reportMdFile = null;
      for (const fileName of possibleFileNames) {
        reportMdFile = zip.file(fileName);
        if (reportMdFile) {
          console.log('Found report file:', fileName);
          break;
        }
      }
      if (!reportMdFile) {
        // Log tất cả file trong ZIP để gỡ lỗi
        const zipFiles = Object.keys(zip.files);
        console.log('Files in ZIP:', zipFiles);
        throw new Error(`Không tìm thấy file báo cáo (tìm: ${possibleFileNames.join(', ')}) trong artifact zap_scan`);
      }
      const reportContent = await reportMdFile.async('text');
      console.log('ZAP Report Content:', reportContent);
      return reportContent;
    } catch (err) {
      console.error('Lỗi lấy artifact ZAP:', {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message
      });
      setError(`Không thể lấy báo cáo ZAP cho Run ID ${runId}: ${err.response?.status || ''} ${err.message}`);
      return null;
    }
  };

  const fetchScaData = async () => {
    try {
      setLoading(true);
      const scaIssue = issues.find(issue => issue.title.toLowerCase() === 'npm audit found vulnerabilities');
      if (!scaIssue) {
        console.warn('Không tìm thấy issue SCA');
        setScaData([]);
        setScaRawReports([]);
        return;
      }

      const comments = await fetchIssueComments(scaIssue.number);
      const npmAuditComments = comments.filter(comment => comment.body.includes('# npm audit report'));
      const allVulnerabilities = npmAuditComments.flatMap(comment => parseNpmAuditReport(comment));
      
      setScaData(allVulnerabilities);
      setScaRawReports(npmAuditComments);
    } catch (err) {
      console.error('Lỗi lấy dữ liệu SCA:', err);
      setError(`Không thể lấy dữ liệu SCA: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const parseNpmAuditReport = (comment) => {
    const vulnerabilities = [];
    const lines = comment.body.split('\n');
    let currentPackage = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line === '# npm audit report') continue;

      const packageMatch = line.match(/^([a-zA-Z0-9-_]+)\s+(.+)$/);
      if (packageMatch) {
        currentPackage = {
          package: packageMatch[1],
          version: packageMatch[2],
          severity: '',
          description: '',
          advisory: '',
          created_at: comment.created_at,
        };
        continue;
      }

      const severityMatch = line.match(/^Severity: (\w+)$/i);
      if (severityMatch && currentPackage) {
        currentPackage.severity = severityMatch[1].toLowerCase();
        continue;
      }

      const advisoryMatch = line.match(/^(.+) - (https:\/\/github\.com\/advisories\/[a-zA-Z0-9-_]+)/);
      if (advisoryMatch && currentPackage) {
        currentPackage.description = advisoryMatch[1];
        currentPackage.advisory = advisoryMatch[2];
        vulnerabilities.push(currentPackage);
        currentPackage = null;
      }
    }

    return vulnerabilities;
  };

  const toggleReport = (index) => {
    setExpandedReports(prev => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const toggleTrivyDetails = (index) => {
    setExpandedTrivyDetails(prev => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  useEffect(() => {
    fetchIssues();
    fetchTrivyAlerts();
  }, []);

  useEffect(() => {
    if (issues.length > 0) {
      fetchScaData();
      const zapIssues = issues
        .filter(issue => issue.title.toLowerCase() === 'zap scan report')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      console.log('Filtered ZAP Issues:', zapIssues);
      if (zapIssues[0]) {
        const runIdMatch = zapIssues[0].body?.match(/RunnerID:(\d+)/i);
        const runId = runIdMatch ? runIdMatch[1] : null;
        console.log('ZAP Run ID:', runId);
        if (runId) {
          fetchZapReport(runId).then(report => {
            console.log('Set Zap Report:', report);
            if (report) {
              setZapReport({
                title: zapIssues[0].title,
                created_at: zapIssues[0].created_at,
                user: zapIssues[0].user,
                html_url: zapIssues[0].html_url,
                report_md: report,
              });
            } else {
              setError(`Không tìm thấy báo cáo zap_scan cho Run ID: ${runId}`);
            }
          });
        } else {
          setError('Không tìm thấy RunnerID trong body của issue ZAP');
        }
      } else {
        setError('Không tìm thấy issue ZAP Scan Report');
      }
    }
  }, [issues]);

  const falcoIssues = issues
    .filter(issue => issue.title.toLowerCase().startsWith('falco logs for ci run'))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  console.log('Filtered Falco Issues:', falcoIssues);
  const latestFalcoIssue = falcoIssues[0] || null;

  const trivyData = trivyAlerts.map(alert => ({
    rule: alert.rule.description,
    severity: alert.rule.security_severity_level || 'unknown',
    created_at: alert.created_at,
    html_url: alert.html_url,
    most_recent_instance: alert.most_recent_instance || {},
  }));

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4">Bảng điều khiển bảo mật CI/CD</h1>
      {loading && <p className="text-blue-500">Đang tải dữ liệu...</p>}
      {error && <p className="text-red-500 font-bold">{error}</p>}
      {!loading && !error && issues.length === 0 && trivyAlerts.length === 0 && scaData.length === 0 && (
        <p className="text-yellow-500">Không có dữ liệu. Vui lòng kiểm tra issue kho lưu trữ và cảnh báo quét mã.</p>
      )}

      <button
        onClick={() => { fetchIssues(); fetchTrivyAlerts(); fetchScaData(); }}
        className="mb-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Làm mới dữ liệu
      </button>

      <div>
        <h2 className="text-xl font-semibold mb-2">Báo cáo chi tiết</h2>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">SCA (npm audit)</h3>
          {scaRawReports.length > 0 ? (
            <div className="mb-4">
              <h4 className="text-md font-semibold mb-2">Báo cáo thô</h4>
              {scaRawReports.map((comment, idx) => (
                <div key={idx} className="mb-4 p-4 bg-gray-100 rounded-lg shadow-md">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      Đăng vào {new Date(comment.created_at).toLocaleString()} bởi {comment.user.login}
                    </p>
                    <button
                      onClick={() => toggleReport(idx)}
                      className="text-blue-500 hover:text-blue-700 text-sm font-semibold"
                    >
                      {expandedReports[idx] ? 'Thu gọn' : 'Mở rộng'}
                    </button>
                  </div>
                  {expandedReports[idx] && (
                    <div className="mt-2 max-h-96 overflow-y-auto p-4 bg-white rounded-lg">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        children={`\`\`\`bash
${comment.body}
\`\`\``}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Chưa có báo cáo SCA.</p>
          )}
          <table className="w-full border-collapse border">
            <thead>
              <tr className="bg-gray-200">
                <th className="border p-2">Gói</th>
                <th className="border p-2">Phiên bản</th>
                <th className="border p-2">Mức độ</th>
                <th className="border p-2">Mô tả</th>
                <th className="border p-2">Liên kết Advisory</th>
                <th className="border p-2">Thời gian tạo</th>
              </tr>
            </thead>
            <tbody>
              {scaData.length > 0 ? (
                scaData.map((item, index) => (
                  <tr key={index}>
                    <td className="border p-2">{item.package}</td>
                    <td className="border p-2">{item.version}</td>
                    <td className="border p-2">{item.severity}</td>
                    <td className="border p-2">{item.description}</td>
                    <td className="border p-2">
                      <a href={item.advisory} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                        Link
                      </a>
                    </td>
                    <td className="border p-2">{new Date(item.created_at).toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="border p-2 text-center">
                    Không có lỗ hổng nào được tìm thấy.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Falco (Runtime Security)</h3>
          {latestFalcoIssue ? (
            <div className="p-4 bg-gray-100 rounded-lg shadow-md">
              <h4 className="text-md font-semibold mb-2">{latestFalcoIssue.title}</h4>
              <p className="text-sm text-gray-600 mb-2">
                Đăng vào {new Date(latestFalcoIssue.created_at).toLocaleString()}
                {latestFalcoIssue.user?.login && ` bởi ${latestFalcoIssue.user.login}`}
                {latestFalcoIssue.html_url && (
                  <>
                    {' | '}
                    <a
                      href={latestFalcoIssue.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 underline"
                    >
                      Xem trên GitHub
                    </a>
                  </>
                )}
              </p>
              <div className="max-h-96 overflow-y-auto p-4 bg-white rounded-lg">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  children={latestFalcoIssue.body || 'Không có nội dung chi tiết.'}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Không tìm thấy issue Falco nào với tiêu đề bắt đầu bằng 'Falco Logs for CI run'.
            </p>
          )}
        </div>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Trivy (Container Image)</h3>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full border-collapse border">
              <thead>
                <tr className="bg-gray-200">
                  <th className="border p-2">Mô tả Quy tắc</th>
                  <th className="border p-2">Mức độ</th>
                  <th className="border p-2">Thời gian tạo</th>
                  <th className="border p-2">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {trivyData.length > 0 ? (
                  trivyData.map((item, index) => (
                    <>
                      <tr key={index}>
                        <td className="border p-2">{item.rule}</td>
                        <td className="border p-2">{item.severity}</td>
                        <td className="border p-2">{new Date(item.created_at).toLocaleString()}</td>
                        <td className="border p-2">
                          <button
                            onClick={() => toggleTrivyDetails(index)}
                            className="text-blue-500 hover:text-blue-700 text-sm font-semibold"
                          >
                            {expandedTrivyDetails[index] ? 'Thu gọn' : 'Mở rộng'}
                          </button>
                        </td>
                      </tr>
                      {expandedTrivyDetails[index] && (
                        <tr>
                          <td colSpan="4" className="border p-4 bg-gray-50">
                            <div className="text-sm">
                              <p><strong>Mô tả:</strong> {item.rule}</p>
                              <p><strong>Mức độ:</strong> {item.severity}</p>
                              <p><strong>Thời gian tạo:</strong> {new Date(item.created_at).toLocaleString()}</p>
                              {item.html_url && (
                                <p>
                                  <strong>Liên kết chi tiết:</strong>{' '}
                                  <a
                                    href={item.html_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-500 underline"
                                  >
                                    Xem trên GitHub
                                  </a>
                                </p>
                              )}
                              {item.most_recent_instance && (
                                <div>
                                  <p><strong>Chi tiết bổ sung:</strong></p>
                                  <ul className="list-disc list-inside">
                                    {item.most_recent_instance.message?.text && (
                                      <li><strong>Thông điệp:</strong> {item.most_recent_instance.message.text}</li>
                                    )}
                                    {item.most_recent_instance.location?.path && (
                                      <li><strong>Đường dẫn:</strong> {item.most_recent_instance.location.path}</li>
                                    )}
                                    {item.most_recent_instance.location?.start_line && (
                                      <li><strong>Dòng bắt đầu:</strong> {item.most_recent_instance.location.start_line}</li>
                                    )}
                                    {item.most_recent_instance.location?.end_line && (
                                      <li><strong>Dòng kết thúc:</strong> {item.most_recent_instance.location.end_line}</li>
                                    )}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="border p-2 text-center">
                      Không có cảnh báo Trivy nào ở trạng thái mở.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">ZAP (DAST)</h3>
          {zapReport ? (
            <div className="p-4 bg-gray-100 rounded-lg shadow-md">
              <h4 className="text-md font-semibold mb-2">{zapReport.title}</h4>
              <p className="text-sm text-gray-600 mb-2">
                Đăng vào {new Date(zapReport.created_at).toLocaleString()}
                {zapReport.user?.login && ` bởi ${zapReport.user.login}`}
                {zapReport.html_url && (
                  <>
                    {' | '}
                    <a
                      href={zapReport.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 underline"
                    >
                      Xem trên GitHub
                    </a>
                  </>
                )}
              </p>
              <div className="max-h-96 overflow-y-auto p-4 bg-white rounded-lg">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  children={zapReport.report_md || 'Không có nội dung báo cáo ZAP.'}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Không tìm thấy issue ZAP Scan Report, RunnerID, hoặc báo cáo zap_scan.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;