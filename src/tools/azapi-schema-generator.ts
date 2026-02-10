/**
 * AzAPI Schema Generator
 *
 * This module downloads the latest AzAPI provider source code from GitHub,
 * parses the bicep types, and generates comprehensive schema documentation
 * with examples and parent information.
 *
 * Ported from Python: https://github.com/liuwuliuyun/tf-mcp-server/blob/main/src/tf_mcp_server/core/azapi_schema_generator.py
 */

import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { extract } from 'tar';

// ==========================================
// Constants
// ==========================================

/** Cache expiry duration in milliseconds (5 days) */
const CACHE_EXPIRY_MS = 5 * 24 * 60 * 60 * 1000;

/** Metadata filename for tracking cache freshness */
const CACHE_METADATA_FILE = 'azapi_cache_metadata.json';

// ==========================================
// Types
// ==========================================

interface CacheMetadata {
  version: string;
  generatedAt: string;
  expiresAt: string;
}

interface BicepTypeData {
  $type?: string;
  name?: string;
  scopeType?: number;
  body?: { $ref?: string };
  properties?: Record<string, BicepPropertyData>;
  [key: string]: unknown;
}

interface BicepPropertyData {
  description?: string;
  flags?: number;
  type?: { $ref?: string } | unknown;
}

/** Parsed property value - can be a string description, nested object, or array */
type ParsedPropertyValue = string | Record<string, unknown> | unknown[] | null;

interface ResourceSchemaData {
  name: string;
  scope: string;
  properties: Record<string, unknown>;
  resourceType: string;
  apiVersion: string;
  parentId: string;
}

// ==========================================
// GitHub Loader
// ==========================================

class GitHubLoader {
  private owner: string;
  private repo: string;
  private tag: string;
  private downloadDir: string;

  constructor(owner: string, repo: string, tag: string = 'latest') {
    this.owner = owner;
    this.repo = repo;
    this.tag = tag;
    this.downloadDir = join(tmpdir(), 'azapi_downloads');

    if (!existsSync(this.downloadDir)) {
      mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  async downloadLatestRelease(): Promise<string> {
    // Get release info
    const apiUrl = `https://api.github.com/repos/${this.owner}/${this.repo}/releases/${this.tag}`;

    const headers: Record<string, string> = {
      'User-Agent': 'Azure-Terraform-MCP-Server',
      Accept: 'application/vnd.github.v3+json',
    };

    // Add GitHub token if available
    const githubToken = process.env['GITHUB_TOKEN'];
    if (githubToken) {
      headers['Authorization'] = `token ${githubToken}`;
    }

    const response = await fetch(apiUrl, { headers });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch release info: ${response.status} ${response.statusText}`
      );
    }

    const releaseInfo = (await response.json()) as {
      tarball_url: string;
      name: string;
    };
    const tarballUrl = releaseInfo.tarball_url;
    const releaseName = releaseInfo.name;
    const tarballName = `${releaseName}.tar.gz`;
    const destPath = join(this.downloadDir, tarballName);

    // Download if not exists
    if (!existsSync(destPath)) {
      console.error(`Downloading ${tarballName} from ${tarballUrl}`);
      const downloadResponse = await fetch(tarballUrl, { headers });
      if (!downloadResponse.ok || !downloadResponse.body) {
        throw new Error(`Failed to download tarball: ${downloadResponse.status}`);
      }

      const fileStream = createWriteStream(destPath);
      const { Readable } = await import('node:stream');
      const nodeStream = Readable.fromWeb(downloadResponse.body as import('node:stream/web').ReadableStream);
      await pipeline(nodeStream, fileStream);
      console.error(`Downloaded ${destPath}`);
    }

    // Extract
    const extractDir = join(this.downloadDir, `extracted_${releaseName}`);
    if (!existsSync(extractDir)) {
      console.error(`Extracting ${destPath}`);
      mkdirSync(extractDir, { recursive: true });

      // Extract tar.gz file
      await this.extractTarGz(destPath, extractDir);
      console.error(`Extracted to ${extractDir}`);
    }

    return extractDir;
  }

  private async extractTarGz(tarPath: string, destDir: string): Promise<void> {
    // Create a temporary directory for extraction
    const tempExtractDir = join(this.downloadDir, 'temp_extract');
    if (existsSync(tempExtractDir)) {
      // Clean up previous temp dir
      this.removeDir(tempExtractDir);
    }
    mkdirSync(tempExtractDir, { recursive: true });

    // Extract using tar module
    await new Promise<void>((resolve, reject) => {
      const gunzip = createGunzip();
      const tarExtract = extract({ cwd: tempExtractDir });

      const readStream = createReadStream(tarPath);

      readStream
        .pipe(gunzip)
        .pipe(tarExtract)
        .on('finish', resolve)
        .on('error', reject);
    });

    // Find the extracted directory (GitHub tarballs have a top-level directory)
    const entries = readdirSync(tempExtractDir);
    if (entries.length === 1 && entries[0]) {
      const extractedSubDir = join(tempExtractDir, entries[0]);
      if (statSync(extractedSubDir).isDirectory()) {
        // Move contents to destination
        this.moveContents(extractedSubDir, destDir);
      }
    } else {
      // Move all contents
      this.moveContents(tempExtractDir, destDir);
    }

    // Clean up temp directory
    this.removeDir(tempExtractDir);
  }

  private moveContents(srcDir: string, destDir: string): void {
    const entries = readdirSync(srcDir);
    for (const entry of entries) {
      const srcPath = join(srcDir, entry);
      const destPath = join(destDir, entry);
      renameSync(srcPath, destPath);
    }
  }

  private removeDir(dir: string): void {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

// ==========================================
// Resource Schema
// ==========================================

class ResourceSchema {
  name: string;
  scope: string;
  properties: Record<string, unknown>;

  constructor(name: string, scope: string, properties: Record<string, unknown>) {
    this.name = name;
    this.scope = scope;
    this.properties = properties;
  }

  get resourceType(): string {
    return this.name.split('@')[0] ?? '';
  }

  get apiVersion(): string {
    const parts = this.name.split('@');
    return parts[1] ?? '';
  }

  parentId(): string {
    const parts = this.resourceType.split('/');
    if (parts.length > 2) {
      return parts.slice(0, -1).join('/');
    }

    // Default to resource group for top-level resources
    if (this.scope === 'ResourceGroup' || this.scope === 'Subscription') {
      return 'Microsoft.Resources/resourceGroups';
    }
    return '';
  }

  asDocumentation(): string {
    const resourceTypeParts = this.resourceType.split('/');
    const lastPart = resourceTypeParts[resourceTypeParts.length - 1] ?? '';
    const label = lastPart.endsWith('s') ? lastPart.slice(0, -1) : lastPart;

    let doc = `# Resource Type: ${this.name}\n`;
    doc += `API Version: ${this.apiVersion}\n`;
    doc += `Parent resource type: ${this.parentId()}\n`;
    doc += 'A json-like Resource Schema reference:\n\n';

    // Generate HCL format
    doc += `\`\`\`hcl\nresource "azapi_resource" "${label}" {\n`;
    doc += this.formatPropertiesAsHcl(this.properties, 2);
    doc += '}\n```\n';

    return doc;
  }

  private formatPropertiesAsHcl(data: unknown, indent: number = 0): string {
    if (data === null || data === undefined) {
      return 'null';
    }

    if (typeof data === 'object' && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;
      const lines: string[] = [];

      // Sort keys using the original key_fn logic
      const keys = Object.keys(obj).sort((a, b) => {
        const keyOrder = (k: string): [number, string] => {
          if (k.startsWith('__')) {
            return [0, k];
          }
          if (['name', 'type', 'parent_id', 'location', 'sku'].includes(k)) {
            return [30, k];
          }
          if (k === 'identity') {
            return [50, k];
          }
          if (k === 'tags') {
            return [9999, k];
          }
          return [100, k];
        };

        const [orderA, keyA] = keyOrder(a);
        const [orderB, keyB] = keyOrder(b);
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return keyA.localeCompare(keyB);
      });

      for (const key of keys) {
        if (key.startsWith('__')) {
          continue;
        }
        const value = obj[key];
        const formattedValue = this.formatPropertiesAsHcl(value, indent + 2);
        lines.push(' '.repeat(indent) + `${key} = ${formattedValue}`);
      }

      return '{\n' + lines.join('\n') + '\n' + ' '.repeat(indent - 2) + '}';
    }

    if (typeof data === 'string') {
      return `"${data}"`;
    }

    if (typeof data === 'boolean') {
      return data ? 'true' : 'false';
    }

    if (typeof data === 'number') {
      return String(data);
    }

    if (Array.isArray(data)) {
      if (data.length === 0) {
        return '[]';
      }
      const items = data.map((item) => this.formatPropertiesAsHcl(item, indent));
      return '[' + items.join(', ') + ']';
    }

    return JSON.stringify(data);
  }

  toDict(): ResourceSchemaData {
    return {
      name: this.name,
      scope: this.scope,
      properties: this.properties,
      resourceType: this.resourceType,
      apiVersion: this.apiVersion,
      parentId: this.parentId(),
    };
  }
}

// ==========================================
// Bicep Types Parser
// ==========================================

class BicepTypesParser {
  private types: BicepTypeData[];
  private parsingStack: number[];

  constructor(typesData: BicepTypeData[]) {
    this.types = typesData;
    this.parsingStack = [];
  }

  getResourceTypes(): Array<{ index: number; name: string; apiVersion: string }> {
    const resourceTypes: Array<{ index: number; name: string; apiVersion: string }> =
      [];

    for (let idx = 0; idx < this.types.length; idx++) {
      const data = this.types[idx];
      if (data?.$type === 'ResourceType') {
        const name = data.name ?? '';
        const apiVersion = name.includes('@') ? name.split('@')[1] ?? '' : '';
        resourceTypes.push({ index: idx, name, apiVersion });
      }
    }

    return resourceTypes;
  }

  parseResourceType(index: number): ResourceSchema | null {
    try {
      const data = this.types[index];
      if (!data) {
        return null;
      }

      const name = data.name ?? '';
      const scopeType = data.scopeType ?? 0;

      // Map scope type to string
      const scopeMap: Record<number, string> = {
        1: 'Tenant',
        2: 'ManagementGroup',
        4: 'Subscription',
        8: 'ResourceGroup',
        16: 'Extension',
      };
      const scope = scopeMap[scopeType] ?? 'Unknown';

      // Parse body properties
      const bodyRef = data.body?.$ref;
      let properties: Record<string, unknown> = {};

      if (bodyRef) {
        const bodyIndex = parseInt(bodyRef.replace('#/', ''), 10);
        properties = this.parseObjectProperties(bodyIndex);
      }

      // Create schema structure matching the original format
      const parentIdDoc = this.getParentIdDoc(name, scopeType);

      const schemaProperties: Record<string, unknown> = {
        type: name,
        parent_id: parentIdDoc,
        body: properties,
      };

      // Add common properties
      if (scopeType & 8) {
        // ResourceGroup scope
        schemaProperties['location'] =
          '(Required) String Type. The geo-location where the resource lives';
      }

      return new ResourceSchema(name, scope, schemaProperties);
    } catch (error) {
      console.error(`Failed to parse resource type at index ${index}:`, error);
      return null;
    }
  }

  private parseObjectProperties(index: number): Record<string, unknown> {
    if (index < 0 || index >= this.types.length || this.parsingStack.includes(index)) {
      return {};
    }

    this.parsingStack.push(index);

    try {
      const data = this.types[index];
      const properties: Record<string, unknown> = {};

      if (data?.properties) {
        for (const [propName, propData] of Object.entries(data.properties)) {
          const propValue = this.parseProperty(propName, propData);
          if (propValue) {
            properties[propName] = propValue;
          }
        }
      }

      return properties;
    } finally {
      this.parsingStack.pop();
    }
  }

  private parseProperty(_name: string, propData: BicepPropertyData): ParsedPropertyValue {
    try {
      const description = propData.description ?? '';
      const flags = propData.flags ?? 0;

      // Check if readonly (skip readonly properties)
      if (flags & 2) {
        // readOnly flag
        return null;
      }

      // Determine if required
      const required = flags & 1 ? '(Required)' : '(Optional)';

      // Parse the property type
      const propType = propData.type;

      if (propType && typeof propType === 'object') {
        const ref = (propType as { $ref?: string }).$ref ?? '';
        if (ref) {
          const refIndex = parseInt(ref.replace('#/', ''), 10);
          if (refIndex >= 0 && refIndex < this.types.length) {
            const refData = this.types[refIndex];
            const refType = refData?.$type ?? '';

            // Parse based on type
            const parsed = this.parseTypeRef(refIndex, refType, required, description);
            if (parsed !== null) {
              return parsed;
            }
          }
        }
      }

      // Fallback for unknown types
      return `${required} Property. ${description}`.trim();
    } catch {
      return `(Optional) Property. ${propData.description ?? ''}`;
    }
  }

  /**
   * Parse a type reference and return appropriate value.
   * For primitive types, returns a string description.
   * For complex types (Object, Array), returns nested structure.
   */
  private parseTypeRef(
    refIndex: number,
    refType: string,
    required: string,
    description: string
  ): ParsedPropertyValue {
    const refData = this.types[refIndex];
    if (!refData) {
      return null;
    }

    switch (refType) {
      case 'StringType':
        return `${required} String. ${description}`.trim();

      case 'IntegerType':
        return `${required} Integer. ${description}`.trim();

      case 'BooleanType':
        return `${required} Boolean. ${description}`.trim();

      case 'StringLiteralType': {
        const literalValue = (refData as { value?: string }).value ?? '';
        return `${required} Literal: "${literalValue}". ${description}`.trim();
      }

      case 'ObjectType': {
        // Check for circular reference before recursing
        if (this.parsingStack.includes(refIndex)) {
          return `${required} Object (circular reference). ${description}`.trim();
        }

        // Recursively parse object properties
        const nestedProps = this.parseObjectProperties(refIndex);

        // If the object has properties, return them with a description marker
        if (Object.keys(nestedProps).length > 0) {
          // Add description as a special property if exists
          if (description) {
            nestedProps['__description__'] = `${required} ${description}`;
          }
          return nestedProps;
        }

        return `${required} Object. ${description}`.trim();
      }

      case 'ArrayType': {
        // Parse the array's item type
        const itemType = (refData as { itemType?: { $ref?: string } }).itemType;
        if (itemType?.$ref) {
          const itemIndex = parseInt(itemType.$ref.replace('#/', ''), 10);
          if (itemIndex >= 0 && itemIndex < this.types.length) {
            const itemData = this.types[itemIndex];
            const itemTypeName = (itemData as BicepTypeData)?.$type ?? '';

            // Get the array element schema
            const elementSchema = this.parseTypeRef(itemIndex, itemTypeName, '', '');

            if (elementSchema !== null && typeof elementSchema === 'object' && !Array.isArray(elementSchema)) {
              // Return array with element schema as first element
              return [{
                '__element_schema__': elementSchema,
                '__description__': `${required} Array. ${description}`.trim()
              }];
            }

            // For primitive arrays, return description
            return `${required} Array of ${this.getTypeDescription(itemTypeName)}. ${description}`.trim();
          }
        }
        return `${required} Array. ${description}`.trim();
      }

      case 'UnionType': {
        // Parse union type - collect allowed values
        const elements = (refData as { elements?: Array<{ $ref?: string }> }).elements ?? [];
        const allowedValues: string[] = [];

        for (const element of elements) {
          if (element.$ref) {
            const elemIndex = parseInt(element.$ref.replace('#/', ''), 10);
            if (elemIndex >= 0 && elemIndex < this.types.length) {
              const elemData = this.types[elemIndex];
              const elemType = (elemData as BicepTypeData)?.$type;

              if (elemType === 'StringLiteralType') {
                const value = (elemData as { value?: string }).value;
                if (value) {
                  allowedValues.push(`"${value}"`);
                }
              } else if (elemType === 'StringType') {
                allowedValues.push('<string>');
              } else if (elemType === 'IntegerType') {
                allowedValues.push('<integer>');
              } else if (elemType === 'BooleanType') {
                allowedValues.push('<boolean>');
              }
            }
          }
        }

        if (allowedValues.length > 0) {
          // Limit displayed values to avoid huge lists
          const displayValues = allowedValues.length > 10
            ? [...allowedValues.slice(0, 10), `... and ${allowedValues.length - 10} more`]
            : allowedValues;
          return `${required} One of: ${displayValues.join(' | ')}. ${description}`.trim();
        }

        return `${required} Union type. ${description}`.trim();
      }

      default:
        return null;
    }
  }

  /**
   * Get a simple type description string
   */
  private getTypeDescription(typeName: string): string {
    switch (typeName) {
      case 'StringType':
        return 'strings';
      case 'IntegerType':
        return 'integers';
      case 'BooleanType':
        return 'booleans';
      case 'ObjectType':
        return 'objects';
      default:
        return 'items';
    }
  }

  private getParentIdDoc(resourceName: string, scopeType: number): string {
    const parts = resourceName.split('@')[0]?.split('/') ?? [];

    if (parts.length > 2) {
      const parentType = parts.slice(0, -1).join('/');
      const parentPart = parts[parts.length - 2] ?? '';
      const parentName = parentPart.toLowerCase().replace(/s$/, '') + 'Name';
      void parentName; // Unused but kept for reference
      return `Reference to the \`id\` property of resource of type: \`${parentType}\`, or a string in the format like: /subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/${parentType}`;
    }

    // Handle scope types
    if (scopeType & 1) {
      // Tenant
      return 'A tenant id in format /tenants/{tenantId}';
    } else if (scopeType & 2) {
      // ManagementGroup
      return 'A management group id in format /providers/Microsoft.Management/managementGroups/{managementGroupId}';
    } else if (scopeType & 4) {
      // Subscription
      return 'A subscription id in format /subscriptions/{subscriptionId}';
    } else if (scopeType & 8) {
      // ResourceGroup
      return 'Reference to the `id` property of a `Microsoft.Resources/resourceGroups`, or a string value in format /subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}';
    } else if (scopeType & 16) {
      // Extension
      return 'A resource id reference to a extension.';
    } else {
      return 'Unknown scope';
    }
  }
}

// ==========================================
// Simple Bicep Parser
// ==========================================

class SimpleBicepParser {
  private bicepDir: string;

  constructor(bicepDir: string) {
    this.bicepDir = bicepDir;
  }

  parseResourceSchemas(): Map<string, ResourceSchema> {
    const schemas = new Map<string, ResourceSchema>();

    // Walk through all JSON files in the bicep directory
    const jsonFiles = this.findJsonFiles(this.bicepDir);

    for (const jsonFile of jsonFiles) {
      try {
        const content = readFileSync(jsonFile, 'utf-8');
        const typesData = JSON.parse(content) as unknown;

        if (!Array.isArray(typesData)) {
          continue;
        }

        // Process this types file
        const parser = new BicepTypesParser(typesData as BicepTypeData[]);
        const resourceTypes = parser.getResourceTypes();

        // Parse each resource type and keep only the latest API version
        const rtVersions = new Map<
          string,
          { index: number; name: string; apiVersion: string }
        >();

        for (const rt of resourceTypes) {
          const resourceType = rt.name.split('@')[0]?.toLowerCase() ?? '';
          const existing = rtVersions.get(resourceType);
          if (!existing || rt.apiVersion > existing.apiVersion) {
            rtVersions.set(resourceType, rt);
          }
        }

        // Parse the latest versions
        for (const rt of rtVersions.values()) {
          try {
            const schema = parser.parseResourceType(rt.index);
            if (schema) {
              schemas.set(schema.resourceType.toLowerCase(), schema);
            }
          } catch (error) {
            console.error(`Failed to parse resource type ${rt.name}:`, error);
            continue;
          }
        }
      } catch (error) {
        console.error(`Failed to parse ${jsonFile}:`, error);
        continue;
      }
    }

    console.error(`Parsed ${schemas.size} resource schemas`);
    return schemas;
  }

  private findJsonFiles(dir: string): string[] {
    const files: string[] = [];

    if (!existsSync(dir)) {
      return files;
    }

    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.findJsonFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(fullPath);
      }
    }

    return files;
  }
}

// ==========================================
// AzAPI Schema Generator
// ==========================================

export class AzAPISchemaGenerator {
  private dataDir: string;
  private currentVersion: string | null = null;

  constructor() {
    this.dataDir = this.getCacheDir();
  }

  private getCacheDir(): string {
    // Prefer workspace root (mounted volume) for persistence across container restarts
    const workspaceRoot = process.env['MCP_WORKSPACE_ROOT'];
    if (workspaceRoot && existsSync(workspaceRoot)) {
      const cacheDir = join(workspaceRoot, '.tf_mcp_server', 'azapi_cache');
      mkdirSync(cacheDir, { recursive: true });
      return cacheDir;
    }

    // Fallback to home directory for local development
    const homeCache = join(homedir(), '.tf_mcp_server', 'azapi_cache');
    mkdirSync(homeCache, { recursive: true });
    return homeCache;
  }

  private getSchemaFile(version: string): string {
    return join(this.dataDir, `azapi_schemas_${version}.json`);
  }

  private getMetadataFile(): string {
    return join(this.dataDir, CACHE_METADATA_FILE);
  }

  private getLatestLocalVersion(): string | null {
    if (!existsSync(this.dataDir)) {
      return null;
    }

    const versionPattern = /azapi_schemas_v(\d+\.\d+\.\d+)\.json/;
    const versions: string[] = [];

    const entries = readdirSync(this.dataDir);
    for (const entry of entries) {
      const match = entry.match(versionPattern);
      if (match?.[1]) {
        versions.push(match[1]);
      }
    }

    if (versions.length === 0) {
      return null;
    }

    // Sort versions semantically
    versions.sort((a, b) => {
      const partsA = a.split('.').map(Number);
      const partsB = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
        if (diff !== 0) {
          return diff;
        }
      }
      return 0;
    });

    return versions[versions.length - 1] ?? null;
  }

  private async checkLatestGitHubVersion(): Promise<string | null> {
    const apiUrl =
      'https://api.github.com/repos/Azure/terraform-provider-azapi/releases/latest';

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Azure-Terraform-MCP-Server',
        Accept: 'application/vnd.github.v3+json',
      };

      const githubToken = process.env['GITHUB_TOKEN'];
      if (githubToken) {
        headers['Authorization'] = `token ${githubToken}`;
      }

      const response = await fetch(apiUrl, { headers });
      if (!response.ok) {
        console.error(`Failed to check latest GitHub version: ${response.status}`);
        return null;
      }

      const releaseInfo = (await response.json()) as { name: string };
      return releaseInfo.name; // This will be something like "v2.6.1"
    } catch (error) {
      console.error('Failed to check latest GitHub version:', error);
      return null;
    }
  }

  private isCacheExpired(): boolean {
    const metadataFile = this.getMetadataFile();
    if (!existsSync(metadataFile)) {
      return true;
    }

    try {
      const content = readFileSync(metadataFile, 'utf-8');
      const metadata = JSON.parse(content) as CacheMetadata;
      const expiresAt = new Date(metadata.expiresAt);
      return new Date() > expiresAt;
    } catch {
      return true;
    }
  }

  private saveCacheMetadata(version: string): void {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_EXPIRY_MS);

    const metadata: CacheMetadata = {
      version,
      generatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    const metadataFile = this.getMetadataFile();
    writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
  }

  async generateSchemas(tag: string = 'latest'): Promise<Record<string, string>> {
    console.error(`Generating AzAPI schemas for tag: ${tag}`);

    try {
      // Download AzAPI provider repository
      const loader = new GitHubLoader('Azure', 'terraform-provider-azapi', tag);
      const repoDir = await loader.downloadLatestRelease();

      // Get the actual version from the release info
      if (tag === 'latest') {
        this.currentVersion = await this.checkLatestGitHubVersion();
      } else {
        this.currentVersion = tag;
      }

      // Find bicep types directory
      const bicepDir = join(repoDir, 'internal', 'azure', 'generated');
      if (!existsSync(bicepDir)) {
        throw new Error(`Bicep directory not found: ${bicepDir}`);
      }

      // Parse schemas
      const parser = new SimpleBicepParser(bicepDir);
      const schemas = parser.parseResourceSchemas();

      // Convert to documentation format
      const schemaDocs: Record<string, string> = {};
      for (const [resourceType, schema] of schemas) {
        schemaDocs[resourceType] = schema.asDocumentation();
      }

      // Save to file with version
      this.saveSchemas(schemaDocs);

      console.error(`Generated ${Object.keys(schemaDocs).length} AzAPI schemas`);
      return schemaDocs;
    } catch (error) {
      console.error('Failed to generate AzAPI schemas:', error);
      throw error;
    }
  }

  private saveSchemas(schemas: Record<string, string>): void {
    mkdirSync(this.dataDir, { recursive: true });

    if (!this.currentVersion) {
      throw new Error('No version set - call generateSchemas first');
    }

    const schemaFile = this.getSchemaFile(this.currentVersion);
    writeFileSync(schemaFile, JSON.stringify(schemas, null, 2), 'utf-8');

    // Save cache metadata with expiry
    this.saveCacheMetadata(this.currentVersion);

    console.error(`Saved schemas to ${schemaFile}`);
  }

  async loadOrGenerateSchemas(
    forceRegenerate: boolean = false
  ): Promise<Record<string, string>> {
    // Check if cache is expired
    if (!forceRegenerate && !this.isCacheExpired()) {
      const latestLocalVersion = this.getLatestLocalVersion();
      if (latestLocalVersion) {
        const schemaFile = this.getSchemaFile(`v${latestLocalVersion}`);
        if (existsSync(schemaFile)) {
          try {
            const content = readFileSync(schemaFile, 'utf-8');
            const schemas = JSON.parse(content) as Record<string, string>;
            console.error(
              `Loaded ${Object.keys(schemas).length} existing AzAPI schemas from cache (expires in ${this.getCacheRemainingTime()})`
            );
            this.currentVersion = `v${latestLocalVersion}`;
            return schemas;
          } catch (error) {
            console.error('Failed to load existing schemas:', error);
          }
        }
      }
    }

    // Check latest GitHub version
    const latestGitHubVersion = await this.checkLatestGitHubVersion();
    const latestLocalVersion = this.getLatestLocalVersion();

    // If we have a local version and it matches the latest GitHub version, load it
    if (
      !forceRegenerate &&
      latestLocalVersion &&
      latestGitHubVersion &&
      latestLocalVersion === latestGitHubVersion?.replace(/^v/, '')
    ) {
      const schemaFile = this.getSchemaFile(`v${latestLocalVersion}`);
      if (existsSync(schemaFile)) {
        try {
          const content = readFileSync(schemaFile, 'utf-8');
          const schemas = JSON.parse(content) as Record<string, string>;
          console.error(
            `Loaded ${Object.keys(schemas).length} existing AzAPI schemas from ${schemaFile}`
          );
          this.currentVersion = `v${latestLocalVersion}`;
          // Update cache metadata to extend expiry
          this.saveCacheMetadata(this.currentVersion);
          return schemas;
        } catch (error) {
          console.error('Failed to load existing schemas:', error);
        }
      }
    }

    // Generate new schemas (either forced, expired, or new version available)
    if (latestGitHubVersion && latestLocalVersion !== latestGitHubVersion.replace(/^v/, '')) {
      console.error(
        `New version available: ${latestGitHubVersion} (local: ${latestLocalVersion ?? 'none'})`
      );
    }

    return this.generateSchemas('latest');
  }

  private getCacheRemainingTime(): string {
    const metadataFile = this.getMetadataFile();
    if (!existsSync(metadataFile)) {
      return 'unknown';
    }

    try {
      const content = readFileSync(metadataFile, 'utf-8');
      const metadata = JSON.parse(content) as CacheMetadata;
      const expiresAt = new Date(metadata.expiresAt);
      const now = new Date();
      const remainingMs = expiresAt.getTime() - now.getTime();

      if (remainingMs <= 0) {
        return 'expired';
      }

      const remainingDays = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
      const remainingHours = Math.floor(
        (remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
      );

      if (remainingDays > 0) {
        return `${remainingDays}d ${remainingHours}h`;
      }
      return `${remainingHours}h`;
    } catch {
      return 'unknown';
    }
  }

  getLatestSchemaFile(): string | null {
    const latestVersion = this.getLatestLocalVersion();
    if (latestVersion) {
      return this.getSchemaFile(`v${latestVersion}`);
    }
    return null;
  }

  async loadWithVersionCheck(): Promise<Record<string, string>> {
    /**
     * Load AzAPI schemas with intelligent version checking and caching.
     *
     * Logic flow:
     * 1. Check if cache is expired (5 days)
     * 2. If not expired, use local cache
     * 3. If expired, check GitHub for latest provider version
     * 4. If version mismatch or no local file, generate from provider source
     * 5. If generation fails, fallback to any local cached version
     */

    // Step 1: Check cache expiry
    if (!this.isCacheExpired()) {
      const latestLocalVersion = this.getLatestLocalVersion();
      const latestSchemaFile = this.getLatestSchemaFile();

      if (latestSchemaFile && existsSync(latestSchemaFile) && latestLocalVersion) {
        try {
          const content = readFileSync(latestSchemaFile, 'utf-8');
          const localSchemaData = JSON.parse(content) as Record<string, string>;
          console.error(
            `Using cached AzAPI schemas (version: v${latestLocalVersion}, expires in ${this.getCacheRemainingTime()})`
          );
          return localSchemaData;
        } catch (error) {
          console.error(`Error reading local schema file ${latestSchemaFile}:`, error);
        }
      }
    }

    // Step 2: Check for latest provider version on GitHub
    console.error('Cache expired or not found. Checking GitHub for latest AzAPI provider version...');
    const remoteVersion = await this.checkLatestGitHubVersion();
    if (remoteVersion) {
      console.error(`Latest provider version: ${remoteVersion}`);
    } else {
      console.error('Failed to check remote provider version');
    }

    // Step 3: Check local cache
    const latestLocalVersion = this.getLatestLocalVersion();
    const latestSchemaFile = this.getLatestSchemaFile();

    if (latestSchemaFile && existsSync(latestSchemaFile) && latestLocalVersion) {
      const localVersion = `v${latestLocalVersion}`;
      console.error(`Found local schema file: ${latestSchemaFile} (version: ${localVersion})`);

      // If versions match, use local cache
      if (remoteVersion && localVersion === remoteVersion) {
        try {
          const content = readFileSync(latestSchemaFile, 'utf-8');
          const localSchemaData = JSON.parse(content) as Record<string, string>;
          console.error(
            `Local version matches provider version ${remoteVersion}. Using cached schema.`
          );
          // Update cache metadata to extend expiry
          this.saveCacheMetadata(localVersion);
          return localSchemaData;
        } catch (error) {
          console.error(`Error reading local schema file ${latestSchemaFile}:`, error);
        }
      }
    }

    // Step 4: Generate schemas from provider source if version mismatch or no local cache
    if (remoteVersion) {
      try {
        console.error(`Generating schemas for provider version ${remoteVersion}...`);
        const schemaData = await this.generateSchemas('latest');
        if (schemaData && Object.keys(schemaData).length > 0) {
          console.error('Successfully generated AzAPI schemas from provider source');
          return schemaData;
        }
      } catch (error) {
        console.error('Failed to generate schemas from provider source:', error);
      }
    }

    // Step 5: Fallback to local cached version if available
    if (latestSchemaFile && existsSync(latestSchemaFile)) {
      try {
        const content = readFileSync(latestSchemaFile, 'utf-8');
        const localSchemaData = JSON.parse(content) as Record<string, string>;
        console.error(`Using cached local schema version v${latestLocalVersion}`);
        return localSchemaData;
      } catch (error) {
        console.error('Failed to load fallback schema:', error);
      }
    }

    console.error('AzAPI schema not available. AzAPI functionality will be limited.');
    return {};
  }
}

// ==========================================
// Singleton Instance & Lazy Loading
// ==========================================

let cachedSchemas: Record<string, string> | null = null;
let schemaLoadPromise: Promise<Record<string, string>> | null = null;

/**
 * Initialize AzAPI schemas on demand (lazy loading).
 * This is thread-safe and will only load schemas once.
 */
export async function initializeAzAPISchemas(
  forceRegenerate: boolean = false
): Promise<Record<string, string>> {
  if (forceRegenerate) {
    cachedSchemas = null;
    schemaLoadPromise = null;
  }

  if (cachedSchemas) {
    return cachedSchemas;
  }

  if (schemaLoadPromise) {
    return schemaLoadPromise;
  }

  schemaLoadPromise = (async () => {
    const generator = new AzAPISchemaGenerator();
    cachedSchemas = await generator.loadWithVersionCheck();
    return cachedSchemas;
  })();

  return schemaLoadPromise;
}

/**
 * Get schema for a specific resource type.
 */
export function getAzAPISchema(
  resourceType: string,
  schemas: Record<string, string>
): string {
  // Direct match
  if (schemas[resourceType]) {
    return schemas[resourceType];
  }

  // Case-insensitive match
  const resourceTypeLower = resourceType.toLowerCase();
  for (const [key, value] of Object.entries(schemas)) {
    if (key.toLowerCase() === resourceTypeLower) {
      return value;
    }
  }

  return '';
}

/**
 * Get parent resource type for a given resource type.
 */
export function getAzAPIParent(resourceType: string): string {
  const parts = resourceType.split('/');
  if (parts.length > 2) {
    return parts.slice(0, -1).join('/');
  }
  return 'Microsoft.Resources/resourceGroups'; // Default parent
}

/**
 * Clear cached schemas (useful for testing).
 */
export function clearAzAPISchemaCache(): void {
  cachedSchemas = null;
  schemaLoadPromise = null;
}
