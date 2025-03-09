# Salesforce Flow XML Risk Analyzer

A GitHub Action that analyzes Salesforce Flow XML files for potential deployment risks using Claude AI.

## Features

- Analyzes Salesforce Flow XML files to identify potential risks
- Provides detailed descriptions of each risk
- Suggests recommendations to mitigate identified issues
- Generates a markdown report of findings
- Output can be used to comment on PRs or create artifacts

## Usage

Add this action to your workflow file:

```yaml
name: Analyze Flow XML

on:
  pull_request:
    paths:
      - "**.xml"
  workflow_dispatch:
    inputs:
      file_path:
        description: "Path to XML file"
        required: true

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Analyze Flow XML
        id: analyze
        uses: emregunel/flow-xml-analyzer@v1
        with:
          claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
          file_path: ${{ github.event.inputs.file_path || 'path/to/your/flow.xml' }}

      - name: Create PR Comment with Results
        if: github.event_name == 'pull_request' && steps.analyze.outputs.has_risks == 'true'
        uses: actions/github-script@v6
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const reportContent = `${{ steps.analyze.outputs.report_content }}`;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: reportContent
            });
```

## Inputs

| Input               | Description                                         | Required | Default                                         |
| ------------------- | --------------------------------------------------- | -------- | ----------------------------------------------- |
| `claude_api_key`    | Your Claude API key                                 | Yes      | -                                               |
| `file_path`         | Path to the XML file to analyze                     | Yes      | -                                               |
| `claude_model`      | Claude model to use                                 | No       | `claude-3-opus-20240229`                        |
| `analysis_prompt`   | Custom prompt for Claude (use `{JSON}` placeholder) | No       | _Default prompt that analyzes deployment risks_ |
| `anthropic_version` | Anthropic API version                               | No       | `2023-06-01`                                    |

## Outputs

| Output           | Description                                                 |
| ---------------- | ----------------------------------------------------------- |
| `has_risks`      | Boolean indicating if any risks were found (`true`/`false`) |
| `report_path`    | Path to the generated markdown report                       |
| `report_content` | Content of the analysis report as markdown                  |

## Example Workflow: Comment on PR with Analysis

```yaml
name: Flow XML Risk Analysis

on:
  pull_request:
    paths:
      - "**.xml"

jobs:
  analyze-flows:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Get changed XML files
        id: changed-files
        uses: tj-actions/changed-files@v35
        with:
          files: "**/*.xml"

      - name: Analyze each changed XML file
        if: steps.changed-files.outputs.all_changed_files != ''
        run: |
          echo "Changed files: ${{ steps.changed-files.outputs.all_changed_files }}"
          mkdir -p reports

          for file in ${{ steps.changed-files.outputs.all_changed_files }}; do
            echo "Analyzing $file"
            
            # Run analyzer on each file
            echo "$file" >> file_list.txt
          done

      - name: Analyze first XML file
        if: steps.changed-files.outputs.all_changed_files != ''
        id: analyze
        uses: emregunel/flow-xml-analyzer@v1
        with:
          claude_api_key: ${{ secrets.CLAUDE_API_KEY }}
          file_path: ${{ steps.changed-files.outputs.all_changed_files_array[0] }}

      - name: Comment on PR
        if: github.event_name == 'pull_request' && steps.analyze.outputs.has_risks == 'true'
        uses: actions/github-script@v6
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const reportContent = `${{ steps.analyze.outputs.report_content }}`;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: reportContent
            });
```

## License

MIT
