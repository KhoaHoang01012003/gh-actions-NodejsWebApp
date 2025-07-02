const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();
const app = express();
const port = process.env.PORT || 8002;

app.use(cors());
app.use(express.json());

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.REPO;

// Endpoint để lấy Issues
app.get('/api/issues', async (req, res) => {
  try {
    if (!GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN is missing');
    }
    const response = await axios.get(`https://api.github.com/repos/${REPO}/issues`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching issues:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: `Failed to fetch issues: ${error.response?.status} ${error.response?.data?.message || error.message}`,
    });
  }
});

// Endpoint để lấy comments của một Issue
app.get('/api/issues/:issueNumber/comments', async (req, res) => {
  const { issueNumber } = req.params;
  try {
    if (!GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN is missing');
    }
    const response = await axios.get(`https://api.github.com/repos/${REPO}/issues/${issueNumber}/comments`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error(`Error fetching comments for issue ${issueNumber}:`, error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: `Failed to fetch comments: ${error.response?.status} ${error.response?.data?.message || error.message}`,
    });
  }
});

// Endpoint để lấy Trivy alerts
app.get('/api/code-scanning/alerts', async (req, res) => {
  try {
    if (!GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN is missing');
    }
    const response = await axios.get(`https://api.github.com/repos/${REPO}/code-scanning/alerts?tool_name=Trivy`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching Trivy alerts:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: `Failed to fetch Trivy alerts: ${error.response?.status} ${error.response?.data?.message || error.message}`,
    });
  }
});

app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
});