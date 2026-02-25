/**
 * AzureRM provider documentation tools for Azure Terraform MCP Server.
 */

import type {
  ArgumentDetail,
  TerraformAzureProviderDocsResult,
  GetAzureRMDocumentationParamsType,
} from '../core/types.js';
import { getGitHubToken } from '../core/config.js';

// ==========================================
// Constants
// ==========================================

const BASE_RESOURCES_URL =
  'https://raw.githubusercontent.com/hashicorp/terraform-provider-azurerm/main/website/docs/r';
const BASE_DATASOURCES_URL =
  'https://raw.githubusercontent.com/hashicorp/terraform-provider-azurerm/main/website/docs/d';

// ==========================================
// Main Provider Function
// ==========================================

/**
 * Search and retrieve comprehensive AzureRM provider documentation.
 */
export async function getAzureRMProviderDocumentation(
  params: GetAzureRMDocumentationParamsType
): Promise<TerraformAzureProviderDocsResult> {
  const { resourceTypeName, docType = 'resource', argumentName, attributeName } = params;

  try {
    // Normalize resource type for GitHub markdown files (keep underscores)
    // Remove azurerm_ prefix if present
    const normalizedType = resourceTypeName.toLowerCase().replace('azurerm_', '');

    // Generate documentation URL based on type
    const isDataSource = ['data-source', 'datasource', 'data_source'].includes(docType.toLowerCase());
    let docUrl = isDataSource
      ? `${BASE_DATASOURCES_URL}/${normalizedType}.html.markdown`
      : `${BASE_RESOURCES_URL}/${normalizedType}.html.markdown`;

    // Fetch documentation
    const headers: Record<string, string> = {
      'Accept': 'text/plain',
      'User-Agent': 'Azure-Terraform-MCP-Server',
    };

    const githubToken = getGitHubToken();
    if (githubToken) {
      headers['Authorization'] = `token ${githubToken}`;
    }

    let response = await fetch(docUrl, { headers });

    if (!response.ok) {
      // If resource not found, try the other type
      const fallbackUrl = isDataSource
        ? `${BASE_RESOURCES_URL}/${normalizedType}.html.markdown`
        : `${BASE_DATASOURCES_URL}/${normalizedType}.html.markdown`;

      const fallbackResponse = await fetch(fallbackUrl, { headers });
      if (fallbackResponse.ok) {
        response = fallbackResponse;
        docUrl = fallbackUrl;
      } else {
        return {
          resourceType: resourceTypeName,
          documentationUrl: docUrl,
          summary: `Documentation not found for ${resourceTypeName} (HTTP ${response.status}). Please double-check the resource type name is correct. If this resource is not available in the AzureRM provider, consider using the AzAPI provider instead, which supports all Azure resource types.`,
          arguments: [],
          attributes: [],
          examples: [],
          notes: [],
        };
      }
    }

    const markdownContent = await response.text();
    const isDataSourceUrl = docUrl.includes('docs/d/');

    // Extract information from the documentation page
    let result: TerraformAzureProviderDocsResult = {
      resourceType: resourceTypeName,
      documentationUrl: docUrl,
      summary: extractSummary(markdownContent, resourceTypeName, isDataSourceUrl),
      arguments: extractArguments(markdownContent, isDataSourceUrl),
      attributes: extractAttributes(markdownContent),
      examples: extractExamples(markdownContent, normalizedType, isDataSourceUrl),
      notes: extractNotes(markdownContent),
    };

    // Filter to specific argument if requested
    if (argumentName) {
      result = filterToArgument(result, argumentName);
    }

    // Filter to specific attribute if requested
    if (attributeName) {
      result = filterToAttribute(result, attributeName);
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      resourceType: resourceTypeName,
      documentationUrl: '',
      summary: `Error retrieving documentation: ${errorMessage}`,
      arguments: [],
      attributes: [],
      examples: [],
      notes: [],
    };
  }
}

// ==========================================
// Filtering Functions
// ==========================================

function filterToArgument(
  result: TerraformAzureProviderDocsResult,
  argumentName: string
): TerraformAzureProviderDocsResult {
  const matchingArgs = result.arguments.filter(
    (arg) => arg.name.toLowerCase() === argumentName.toLowerCase()
  );

  return {
    ...result,
    arguments: matchingArgs,
    summary: matchingArgs.length > 0
      ? `Argument details for '${argumentName}' in ${result.resourceType}`
      : `Argument '${argumentName}' not found in ${result.resourceType}`,
  };
}

function filterToAttribute(
  result: TerraformAzureProviderDocsResult,
  attributeName: string
): TerraformAzureProviderDocsResult {
  const matchingAttrs = result.attributes.filter(
    (attr) => attr.name.toLowerCase() === attributeName.toLowerCase()
  );

  return {
    ...result,
    attributes: matchingAttrs,
    summary: matchingAttrs.length > 0
      ? `Attribute details for '${attributeName}' in ${result.resourceType}`
      : `Attribute '${attributeName}' not found in ${result.resourceType}`,
  };
}

// ==========================================
// Extraction Functions
// ==========================================

function extractSummary(
  markdownContent: string,
  resourceType: string,
  isDataSource: boolean
): string {
  const lines = markdownContent.split('\n');

  let inFrontmatter = false;
  let frontmatterEnded = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';

    // Track frontmatter boundaries
    if (line === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
        continue;
      } else {
        frontmatterEnded = true;
        continue;
      }
    }

    // Skip frontmatter content
    if (inFrontmatter && !frontmatterEnded) {
      continue;
    }

    // Look for description after frontmatter
    if (frontmatterEnded && line && !line.startsWith('#')) {
      if (line.length > 20) {
        return line;
      }
    }

    // Also look for description under ## Description header
    if (line.toLowerCase().startsWith('## description')) {
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const descLine = lines[j]?.trim() ?? '';
        if (descLine && !descLine.startsWith('#')) {
          return descLine;
        }
      }
    }
  }

  return generateDefaultSummary(resourceType, isDataSource);
}

function generateDefaultSummary(resourceType: string, isDataSource: boolean): string {
  const displayName = resourceType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  if (isDataSource) {
    return `Use this data source to access information about an existing ${displayName}.`;
  }
  return `Manages an Azure ${displayName} resource.`;
}

function extractArguments(markdownContent: string, isDataSource: boolean): ArgumentDetail[] {
  const args: ArgumentDetail[] = [];
  const lines = markdownContent.split('\n');

  let inArgumentsSection = false;

  for (let i = 0; i < lines.length; i++) {
    const lineStripped = lines[i]?.trim() ?? '';

    // Look for Arguments Reference section
    if (/^##\s+(Arguments?\s+Reference|Argument\s+Reference)/i.test(lineStripped)) {
      inArgumentsSection = true;
      continue;
    }

    // Stop when we hit another major section OR block definition
    if (inArgumentsSection) {
      if (
        (lineStripped.startsWith('## ') &&
          !/^##\s+(Arguments?\s+Reference|Argument\s+Reference)/i.test(lineStripped)) ||
        /^(?:A|An|The)\s+`[^`]+`\s+block\s+supports\s+the\s+following:/i.test(lineStripped)
      ) {
        break;
      }
    }

    if (inArgumentsSection && lineStripped) {
      // Look for argument definitions (start with * or -)
      const argMatch = lineStripped.match(/^[*-]\s*`([^`]+)`\s*[-–—]\s*(.+)/);
      if (argMatch) {
        const argName = argMatch[1]?.trim() ?? '';
        const description = argMatch[2]?.trim() ?? '';

        // Determine if required
        const required = /\(Required\)/i.test(description);

        // Clean up description
        let cleanedDescription = description
          .replace(/\s*\((?:Required|Optional)\)\s*[-–—]?\s*/gi, '')
          .trim();
        cleanedDescription = cleanedDescription.replace(/^[-–—]\s*/, '').trim();

        // Determine if this is a block argument
        const isBlock = /block/i.test(cleanedDescription);

        const argDetail: ArgumentDetail = {
          name: argName,
          description: cleanedDescription,
          required,
          type: isBlock ? 'Block' : 'Single',
          blockArguments: isBlock ? [] : undefined,
        };

        args.push(argDetail);
      }
    }
  }

  // Extract block definitions and populate nested arguments
  const blockDefinitions = extractBlockDefinitions(markdownContent);

  for (const arg of args) {
    if (arg.type === 'Block' && blockDefinitions[arg.name]) {
      arg.blockArguments = blockDefinitions[arg.name];
    }
  }

  // Add common arguments if none were found
  if (args.length === 0) {
    return getDefaultArguments(isDataSource);
  }

  return args;
}

function getDefaultArguments(isDataSource: boolean): ArgumentDetail[] {
  if (isDataSource) {
    return [
      {
        name: 'name',
        description: 'Specifies the name of the resource to retrieve information about.',
        required: false,
        type: 'Single',
      },
      {
        name: 'resource_group_name',
        description: 'The name of the resource group containing the resource.',
        required: false,
        type: 'Single',
      },
    ];
  }

  return [
    {
      name: 'name',
      description: 'Specifies the name of the resource.',
      required: true,
      type: 'Single',
    },
    {
      name: 'resource_group_name',
      description: 'The name of the resource group in which to create the resource.',
      required: true,
      type: 'Single',
    },
    {
      name: 'location',
      description: 'Specifies the supported Azure location where the resource exists.',
      required: true,
      type: 'Single',
    },
    {
      name: 'tags',
      description: 'A mapping of tags to assign to the resource.',
      required: false,
      type: 'Single',
    },
  ];
}

function extractBlockDefinitions(
  markdownContent: string
): Record<string, ArgumentDetail[]> {
  const blockDefinitions: Record<string, ArgumentDetail[]> = {};
  const lines = markdownContent.split('\n');

  let currentBlockName: string | null = null;
  let currentBlockArgs: ArgumentDetail[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineStripped = lines[i]?.trim() ?? '';

    // Look for block definition headers
    const blockHeaderMatch = lineStripped.match(
      /^(?:A|An|The)\s+`([^`]+)`\s+block\s+supports\s+the\s+following:/i
    );

    if (blockHeaderMatch) {
      // Save previous block if exists
      if (currentBlockName && currentBlockArgs.length > 0) {
        blockDefinitions[currentBlockName] = currentBlockArgs;
      }

      currentBlockName = blockHeaderMatch[1]?.trim() ?? '';
      currentBlockArgs = [];
      continue;
    }

    // Look for end of block
    if (currentBlockName) {
      const nextLine = lines[i + 1]?.trim() ?? '';
      if (
        lineStripped === '---' ||
        lineStripped.startsWith('## ') ||
        (lineStripped === '' &&
          /^(?:A|An|The)\s+`[^`]+`\s+block\s+supports\s+the\s+following:/i.test(nextLine))
      ) {
        if (currentBlockArgs.length > 0) {
          blockDefinitions[currentBlockName] = currentBlockArgs;
        }
        currentBlockName = null;
        currentBlockArgs = [];
        continue;
      }

      // Look for argument definitions within block
      const argMatch = lineStripped.match(/^[*-]\s*`([^`]+)`\s*[-–—]\s*(.+)/);
      if (argMatch) {
        const argName = argMatch[1]?.trim() ?? '';
        const description = argMatch[2]?.trim() ?? '';

        const required = /\(Required\)/i.test(description);
        let cleanedDescription = description
          .replace(/\s*\((?:Required|Optional)\)\s*[-–—]?\s*/gi, '')
          .trim();
        cleanedDescription = cleanedDescription.replace(/^[-–—]\s*/, '').trim();

        const isNestedBlock = /block/i.test(cleanedDescription);

        currentBlockArgs.push({
          name: argName,
          description: cleanedDescription,
          required,
          type: isNestedBlock ? 'Block' : 'Single',
          blockArguments: isNestedBlock ? [] : undefined,
        });
      }
    }
  }

  // Handle the last block
  if (currentBlockName && currentBlockArgs.length > 0) {
    blockDefinitions[currentBlockName] = currentBlockArgs;
  }

  return blockDefinitions;
}

function extractAttributes(
  markdownContent: string
): Array<{ name: string; description: string }> {
  const attributes: Array<{ name: string; description: string }> = [
    { name: 'id', description: 'The ID of the resource.' },
  ];

  const lines = markdownContent.split('\n');
  let inAttributesSection = false;
  let currentBlock: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineStripped = lines[i]?.trim() ?? '';

    // Look for Attributes Reference section
    if (/^##\s+(Attributes?\s+Reference|Attribute\s+Reference)/i.test(lineStripped)) {
      inAttributesSection = true;
      continue;
    }

    // Stop when we hit another major section
    if (
      inAttributesSection &&
      lineStripped.startsWith('## ') &&
      !/^##\s+(Attributes?\s+Reference|Attribute\s+Reference)/i.test(lineStripped)
    ) {
      break;
    }

    if (inAttributesSection) {
      // Look for attribute definitions
      const match = lineStripped.match(/^[*-]\s*`([^`]+)`\s*[-–—]\s*(.+)/);
      if (match) {
        const attrName = match[1]?.trim() ?? '';
        const description = match[2]?.trim() ?? '';

        if (!attributes.some((attr) => attr.name === attrName)) {
          attributes.push({ name: attrName, description });
        }

        // Track block context
        if (/block/i.test(lineStripped)) {
          currentBlock = attrName;
        }
      }

      // Look for nested block attributes
      const nestedMatch = lineStripped.match(/^\s+[*-]\s*`([^`]+)`\s*[-–—]\s*(.+)/);
      if (nestedMatch && currentBlock) {
        const nestedAttr = nestedMatch[1]?.trim() ?? '';
        const nestedDesc = nestedMatch[2]?.trim() ?? '';
        const fullName = `${currentBlock}.${nestedAttr}`;

        if (!attributes.some((attr) => attr.name === fullName)) {
          attributes.push({ name: fullName, description: `(Block attribute) ${nestedDesc}` });
        }
      }
    }
  }

  return attributes;
}

function extractExamples(
  markdownContent: string,
  normalizedType: string,
  isDataSource: boolean
): string[] {
  const examples: string[] = [];
  const lines = markdownContent.split('\n');

  let inCodeBlock = false;
  let currentCode: string[] = [];
  let codeBlockLang = '';

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim().toLowerCase();
        currentCode = [];
      } else {
        inCodeBlock = false;

        if (['hcl', 'terraform', ''].includes(codeBlockLang) && currentCode.length > 0) {
          const codeText = currentCode.join('\n').trim();
          const blockType = isDataSource ? 'data' : 'resource';
          const resourceName = normalizedType.replace(/-/g, '_');

          if (
            codeText.includes(blockType) &&
            (codeText.includes(`azurerm_${resourceName}`) ||
              codeText.includes(`"${resourceName}"`) ||
              codeText.includes(resourceName))
          ) {
            examples.push(codeText);
            if (examples.length >= 3) {break;}
          }
        }

        currentCode = [];
        codeBlockLang = '';
      }
    } else if (inCodeBlock) {
      currentCode.push(line);
    }
  }

  // Generate basic example if none found
  if (examples.length === 0) {
    const resourceName = normalizedType.replace(/-/g, '_');

    if (isDataSource) {
      examples.push(`data "azurerm_${resourceName}" "example" {
  name                = "example-${normalizedType}"
  resource_group_name = "example-resource-group"
}

# Use the data source
output "${resourceName}_id" {
  value = data.azurerm_${resourceName}.example.id
}`);
    } else {
      examples.push(`resource "azurerm_${resourceName}" "example" {
  name                = "example-${normalizedType}"
  resource_group_name = azurerm_resource_group.example.name
  location            = azurerm_resource_group.example.location

  tags = {
    Environment = "Development"
  }
}`);
    }
  }

  return examples;
}

function extractNotes(markdownContent: string): string[] {
  const notes: string[] = [];
  const lines = markdownContent.split('\n');

  const notePatterns = [
    /^>\s*\*\*NOTE:?\*\*\s*(.*)$/i,
    /^>\s*NOTE:?\s*(.*)$/i,
    /^->\s*\*\*NOTE:?\*\*\s*(.*)$/i,
    /^->\s*NOTE:?\s*(.*)$/i,
    /^~>\s*\*\*NOTE:?\*\*\s*(.*)$/i,
    /^~>\s*NOTE:?\s*(.*)$/i,
    /^\*\*NOTE:?\*\*\s*(.*)$/i,
    /^NOTE:?\s*(.*)$/i,
  ];

  let inNoteBlock = false;
  let currentNote: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineStripped = lines[i]?.trim() ?? '';

    // Check if this line starts a note
    let noteMatch: RegExpMatchArray | null = null;
    for (const pattern of notePatterns) {
      noteMatch = lineStripped.match(pattern);
      if (noteMatch) {break;}
    }

    if (noteMatch) {
      if (currentNote.length > 0) {
        const noteText = currentNote.join(' ').trim();
        if (noteText) {notes.push(noteText);}
      }

      const noteContent = noteMatch[1]?.trim() ?? '';
      currentNote = noteContent ? [noteContent] : [];
      inNoteBlock = true;
      continue;
    }

    if (inNoteBlock) {
      if (
        lineStripped.startsWith('>') ||
        lineStripped.startsWith('->') ||
        lineStripped.startsWith('~>')
      ) {
        const cleanLine = lineStripped
          .replace(/^~>\s*/, '')
          .replace(/^->\s*/, '')
          .replace(/^>\s*/, '')
          .trim();
        if (cleanLine) {currentNote.push(cleanLine);}
        continue;
      } else {
        if (currentNote.length > 0) {
          const noteText = currentNote.join(' ').trim();
          if (noteText) {notes.push(noteText);}
          currentNote = [];
        }
        inNoteBlock = false;
      }
    }
  }

  // Handle last note
  if (currentNote.length > 0) {
    const noteText = currentNote.join(' ').trim();
    if (noteText) {notes.push(noteText);}
  }

  // Clean up notes
  const cleanedNotes: string[] = [];
  const seenNotes = new Set<string>();

  for (const note of notes) {
    const cleaned = note
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();

    if (cleaned.length > 10 && !seenNotes.has(cleaned.toLowerCase())) {
      cleanedNotes.push(cleaned);
      seenNotes.add(cleaned.toLowerCase());
    }
  }

  return cleanedNotes;
}
