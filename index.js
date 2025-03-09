const fs = require("fs");
const path = require("path");
const axios = require("axios");
const core = require("@actions/core");
const github = require("@actions/github");
const { XMLParser } = require("fast-xml-parser");
const Table = require("cli-table3");

// Get inputs from GitHub Actions
const API_KEY = core.getInput("claude_api_key", { required: true });
const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = core.getInput("claude_model") || "claude-3-opus-20240229";
const ANALYSIS_PROMPT =
  core.getInput("analysis_prompt") ||
  "Analyze the following Salesforce Flow XML for potential risks in deployment:\n\n{JSON} Output should be JSON with columns Risk, Description, and Recommendation. Do not include text outside of the JSON object.";
const FILE_PATH = core.getInput("file_path", { required: true });
const ANTHROPIC_VERSION = core.getInput("anthropic_version") || "2023-06-01";

/**
 * Read an XML file.
 * @param {string} filePath - Path to the XML file.
 * @returns {Object} - Object with file name and content.
 */
const readXMLFile = (filePath) => {
  try {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
      core.setFailed(`File not found: ${fullPath}`);
      return null;
    }

    if (!fullPath.endsWith(".xml")) {
      core.setFailed(`File is not an XML file: ${fullPath}`);
      return null;
    }

    return {
      name: path.basename(fullPath),
      content: fs.readFileSync(fullPath, "utf-8"),
    };
  } catch (error) {
    core.setFailed(`Error reading XML file: ${error.message}`);
    return null;
  }
};

/**
 * Analyze XML content with Claude API
 * @param {string} xmlContent - XML content as a string.
 * @returns {Promise<Array>} - Array of risk objects.
 */
const analyzeXMLWithClaude = async (xmlContent) => {
  try {
    const parser = new XMLParser();
    const parsedXML = parser.parse(xmlContent);
    const jsonString = JSON.stringify(parsedXML, null, 2);

    // Replace {JSON} placeholder in the prompt with actual JSON
    const prompt = ANALYSIS_PROMPT.replace("{JSON}", jsonString);

    core.info(`Using Claude model: ${CLAUDE_MODEL}`);

    const response = await axios.post(
      CLAUDE_URL,
      {
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          "x-api-key": API_KEY,
          "content-type": "application/json",
          "anthropic-version": ANTHROPIC_VERSION,
        },
      }
    );

    // Extract the analysis from the response
    const responseText = response.data.content[0].text;

    // Try to parse the JSON from the response
    try {
      // Find JSON in the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonString = jsonMatch[0];
        return JSON.parse(jsonString);
      } else {
        core.warning("Could not find JSON in Claude's response");
        return [];
      }
    } catch (parseError) {
      core.warning(
        `Failed to parse JSON from Claude's response: ${parseError.message}`
      );
      return [];
    }
  } catch (error) {
    core.setFailed(
      `Error analyzing XML with Claude: ${
        error.response?.data?.error?.message || error.message
      }`
    );
    return [];
  }
};

/**
 * Create markdown table from analysis results
 * @param {string} fileName - Name of the analyzed file
 * @param {Object} analysisData - Analysis data from Claude
 * @returns {string} - Markdown formatted table
 */
const createMarkdownReport = (fileName, analysisData) => {
  let mdReport =
    `# Flow XML Risk Analysis for ${fileName}\n\n` +
    "| ⚠️ Risk | 📝 Description | 💡 Recommendation |\n" +
    "|---------|----------------|--------------------|\n";

  if (Array.isArray(analysisData.risks)) {
    analysisData.risks.forEach((risk) => {
      mdReport += `| ${risk.Risk} | ${risk.Description} | ${risk.Recommendation} |\n`;
    });
  } else if (Array.isArray(analysisData)) {
    analysisData.forEach((risk) => {
      mdReport += `| ${risk.Risk} | ${risk.Description} | ${risk.Recommendation} |\n`;
    });
  } else if (typeof analysisData === "object" && analysisData !== null) {
    mdReport += `| ${analysisData.Risk} | ${analysisData.Description} | ${analysisData.Recommendation} |\n`;
  }

  return mdReport;
};

/**
 * Main function
 */
async function run() {
  try {
    core.info(`🔍 Analyzing XML file: ${FILE_PATH}`);

    const file = readXMLFile(FILE_PATH);
    if (!file) return;

    const table = new Table({
      head: ["⚠️ Risk", "📝 Description", "💡 Recommendation"],
      colWidths: [20, 50, 50],
      wordWrap: true,
    });

    core.info(`📂 Analyzing: ${file.name}...`);
    const analysisData = await analyzeXMLWithClaude(file.content);

    let hasRisks = false;

    if (Array.isArray(analysisData.risks)) {
      // If the response has a risks array
      analysisData.risks.forEach((risk) => {
        table.push([risk.Risk, risk.Description, risk.Recommendation]);
        hasRisks = true;
      });
    } else if (Array.isArray(analysisData)) {
      // If the response is directly an array of risks
      analysisData.forEach((risk) => {
        table.push([risk.Risk, risk.Description, risk.Recommendation]);
        hasRisks = true;
      });
    } else if (typeof analysisData === "object" && analysisData !== null) {
      // If response is a single risk object
      table.push([
        analysisData.Risk,
        analysisData.Description,
        analysisData.Recommendation,
      ]);
      hasRisks = true;
    } else {
      core.warning(`No valid risk data found for ${file.name}`);
    }

    if (hasRisks) {
      // Log the table to console
      console.log("\n" + table.toString());

      // Create markdown report
      const mdReport = createMarkdownReport(file.name, analysisData);

      // Write report to file
      const reportPath = "analysis-report.md";
      fs.writeFileSync(reportPath, mdReport);

      // Set outputs for other GitHub Action steps
      core.setOutput("report_path", reportPath);
      core.setOutput("has_risks", "true");
      core.setOutput("report_content", mdReport);
    } else {
      core.setOutput("has_risks", "false");
      core.setOutput("report_content", `No risks found in ${file.name}`);
    }
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

run();
