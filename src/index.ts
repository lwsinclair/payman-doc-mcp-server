import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";

const server = new McpServer({
	name: "payman-mcp",
	version: "1.0.0",
});

function log(message: string, ...args: any[]): void {
	console.error(`[${new Date().toISOString()}] ${message}`, ...args);
}

const documentCache = new Map<string, { content: string; timestamp: number }>();
const CACHE_TTL = 3600000;

async function fetchDocMarkdown(path: string): Promise<string> {
	const now = Date.now();
	const cachedDoc = documentCache.get(path);

	if (cachedDoc && now - cachedDoc.timestamp < CACHE_TTL) {
		log(`Using cached content for: ${path}`);
		return cachedDoc.content;
	}

	try {
		const url = `https://docs.paymanai.com${path}.md`;
		log(`Fetching: ${url}`);

		const response = await fetch(url);

		if (!response.ok) {
			throw new Error(`Failed to fetch: ${response.status}`);
		}

		const content = await response.text();
		documentCache.set(path, { content, timestamp: now });

		return content;
	} catch (error) {
		log(`Error fetching documentation: ${error}`);
		return `Documentation content not available for path: ${path}.md\nError: ${
			error instanceof Error ? error.message : String(error)
		}`;
	}
}

const docTopics = [
	"quickstart",
	"playground",
	"setup-and-installation",
	"create-payees",
	"send-payments",
	"create-payee",
	"search-payees",
	"check-balances",
	"bill-payment-agent",
	"api-reference",
	"api-keys",
	"error-handling",
] as const;

const pathMap: Record<string, string> = {
	quickstart: "/overview/quickstart",
	playground: "/overview/playground",
	"setup-and-installation": "/sdks/setup-and-installation",
	"create-payees": "/sdks/create-payees",
	"send-payments": "/sdks/send-payments",
	"create-payee": "/sdks/create-payee",
	"search-payees": "/sdks/search-payees",
	"check-balances": "/sdks/check-balances",
	"bill-payment-agent": "/guides/bill-payment-agent",
	"api-reference": "/api-reference/introduction",
	"api-keys": "/api-reference/get-api-key",
	"error-handling": "/api-reference/error-handling",
};

const topicMetadata: Record<
	string,
	{
		title: string;
		relatedTopics: string[];
	}
> = {
	quickstart: {
		title: "Quickstart Guide",
		relatedTopics: ["setup-and-installation", "api-keys"],
	},
	playground: {
		title: "API Playground",
		relatedTopics: ["api-reference", "api-keys"],
	},
	"setup-and-installation": {
		title: "Setup and Installation",
		relatedTopics: ["api-keys", "quickstart"],
	},
	"create-payees": {
		title: "Create Payees",
		relatedTopics: ["create-payee", "search-payees"],
	},
	"send-payments": {
		title: "Send Payments",
		relatedTopics: ["check-balances", "create-payees"],
	},
	"create-payee": {
		title: "Create Payee",
		relatedTopics: ["create-payees", "search-payees"],
	},
	"search-payees": {
		title: "Search Payees",
		relatedTopics: ["create-payee", "create-payees"],
	},
	"check-balances": {
		title: "Check Balances",
		relatedTopics: ["send-payments"],
	},
	"bill-payment-agent": {
		title: "Bill Payment Agent",
		relatedTopics: ["send-payments"],
	},
	"api-reference": {
		title: "API Reference",
		relatedTopics: ["error-handling", "api-keys"],
	},
	"api-keys": {
		title: "API Keys",
		relatedTopics: ["api-reference", "setup-and-installation"],
	},
	"error-handling": {
		title: "Error Handling",
		relatedTopics: ["api-reference"],
	},
};

server.tool(
	"get-documentation",
	"Get PaymanAI documentation on a specific topic",
	{
		topic: z
			.enum(docTopics)
			.describe("The documentation topic to retrieve"),
	},
	async ({ topic }) => {
		const path = pathMap[topic];
		log(`Getting doc for topic: ${topic}, path: ${path}`);
		const docContent = await fetchDocMarkdown(path);

		const relatedTopics = topicMetadata[topic].relatedTopics;
		const relatedTopicsText =
			relatedTopics.length > 0
				? `\n\n## Related Topics\n\n${relatedTopics
						.map(
							(t) =>
								`- ${topicMetadata[t].title} (use get-documentation with topic "${t}")`
						)
						.join("\n")}`
				: "";

		return {
			content: [
				{
					type: "text",
					text: docContent + relatedTopicsText,
				},
			],
		};
	}
);

server.tool(
	"search-documentation",
	"Search through PaymanAI documentation",
	{
		query: z.string().describe("Search term"),
	},
	async ({ query }) => {
		log(`Searching for: "${query}"`);

		const docsToSearch = Object.entries(pathMap).map(([topic, path]) => ({
			topic,
			path,
			title: topicMetadata[topic].title,
		}));

		const searchPromises = docsToSearch.map(async (doc) => {
			const content = await fetchDocMarkdown(doc.path);
			const queryLower = query.toLowerCase();

			if (content.toLowerCase().includes(queryLower)) {
				const sections = content.split(/^#+\s+/m);
				let bestSection = "";
				let bestContext = "";

				for (const section of sections) {
					if (section.toLowerCase().includes(queryLower)) {
						const lines = section.split("\n");
						const sectionTitle = lines[0] || "";
						const sectionContent = lines.slice(1).join("\n");

						const index = sectionContent
							.toLowerCase()
							.indexOf(queryLower);
						const start = Math.max(0, index - 150);
						const end = Math.min(
							sectionContent.length,
							index + queryLower.length + 150
						);
						const excerpt =
							(start > 0 ? "..." : "") +
							sectionContent
								.substring(start, end)
								.replace(/\n+/g, " ") +
							(end < sectionContent.length ? "..." : "");

						bestSection = sectionTitle;
						bestContext = excerpt;
						break;
					}
				}

				return {
					title: doc.title,
					topic: doc.topic,
					section: bestSection,
					excerpt: bestContext || content.substring(0, 200) + "...",
				};
			}
			return null;
		});

		const searchResults = (await Promise.all(searchPromises)).filter(
			Boolean
		);

		if (searchResults.length === 0) {
			const possibleTopics = Object.entries(topicMetadata)
				.filter(
					([topic, meta]) =>
						topic.includes(query.toLowerCase()) ||
						meta.title.toLowerCase().includes(query.toLowerCase())
				)
				.map(([topic, meta]) => ({
					topic,
					title: meta.title,
				}));

			let suggestionText = "";
			if (possibleTopics.length > 0) {
				suggestionText =
					"\n\nYou might be interested in these topics:\n\n" +
					possibleTopics
						.map(
							(s) =>
								`- ${s.title} (use get-documentation with topic "${s.topic}")`
						)
						.join("\n");
			}

			return {
				content: [
					{
						type: "text",
						text: `No results found for "${query}". Try a different search term.${suggestionText}`,
					},
				],
			};
		}

		const formattedResults = searchResults
			.map((r) => {
				if (!r) return "";

				const sectionHeading = r.section ? `### ${r.section}\n\n` : "";

				return `## ${r.title}\n\n${sectionHeading}${r.excerpt}\n\n*For full documentation, use the get-documentation tool with topic "${r.topic}".*`;
			})
			.join("\n\n---\n\n");

		return {
			content: [
				{
					type: "text",
					text: `# Search Results for "${query}"\n\n${formattedResults}`,
				},
			],
		};
	}
);

server.tool(
	"get-code-examples",
	"Get Node.js or Python code examples for PaymanAI integration",
	{
		feature: z
			.string()
			.describe(
				"The feature or functionality you need code examples for"
			),
		language: z
			.enum(["nodejs", "python"])
			.default("nodejs")
			.describe("Programming language (nodejs or python)"),
	},
	async ({ feature, language }) => {
		log(`Getting ${language} code example for: "${feature}"`);

		const potentialTopics = Object.entries(pathMap)
			.filter(
				([topic]) =>
					topic.toLowerCase().includes(feature.toLowerCase()) ||
					topicMetadata[topic].title
						.toLowerCase()
						.includes(feature.toLowerCase())
			)
			.map(([topic]) => topic);

		const topicsToSearch =
			potentialTopics.length > 0 ? potentialTopics : Object.keys(pathMap);

		const examplesPromises = topicsToSearch.map(async (topic) => {
			const path = pathMap[topic];
			const content = await fetchDocMarkdown(path);

			const codeBlockRegex =
				language === "nodejs"
					? /```(?:javascript|typescript|js|nodejs|node)([\s\S]*?)```/g
					: /```(?:python|py)([\s\S]*?)```/g;

			const matches = [...content.matchAll(codeBlockRegex)];

			const relevantBlocks = matches
				.map((match) => match[1].trim())
				.filter(
					(code) =>
						code.toLowerCase().includes(feature.toLowerCase()) ||
						content
							.substring(
								Math.max(0, content.indexOf(code) - 300),
								content.indexOf(code)
							)
							.toLowerCase()
							.includes(feature.toLowerCase())
				);

			if (relevantBlocks.length === 0) return null;

			return {
				topic,
				title: topicMetadata[topic].title,
				examples: relevantBlocks,
			};
		});

		const allExamples = (await Promise.all(examplesPromises)).filter(
			Boolean
		);

		if (allExamples.length === 0) {
			return {
				content: [
					{
						type: "text",
						text: `No ${language} code examples found for "${feature}". Try searching for a different feature or check the full documentation using get-documentation.`,
					},
				],
			};
		}

		let responseText = `# ${language.toUpperCase()} Code Examples for "${feature}"\n\n`;

		allExamples.forEach((topicExamples) => {
			if (!topicExamples) return;

			responseText += `## From ${topicExamples.title}\n\n`;

			topicExamples.examples.forEach((code, index) => {
				responseText += `### Example ${index + 1}\n\n`;
				responseText += `\`\`\`${
					language === "nodejs" ? "javascript" : "python"
				}\n${code}\n\`\`\`\n\n`;
			});

			responseText += `*For more context, check the full documentation: use get-documentation with topic "${topicExamples.topic}".*\n\n---\n\n`;
		});

		return {
			content: [
				{
					type: "text",
					text: responseText,
				},
			],
		};
	}
);

server.tool(
	"solve-problem",
	"Get help with common PaymanAI integration issues",
	{
		problem: z.string().describe("Describe the issue you're experiencing"),
		sdk: z
			.enum(["nodejs", "python"])
			.optional()
			.describe("Which SDK you're using (nodejs or python)"),
	},
	async ({ problem, sdk }) => {
		log(`Solving problem: "${problem}" for SDK: ${sdk || "any"}`);

		const problemCategories = [
			{
				category: "Authentication",
				keywords: [
					"api key",
					"auth",
					"authentication",
					"unauthorized",
					"401",
				],
				topics: ["api-keys", "error-handling"],
			},
			{
				category: "Payments",
				keywords: [
					"payment",
					"send payment",
					"transaction",
					"failed payment",
				],
				topics: ["send-payments", "error-handling"],
			},
			{
				category: "Payees",
				keywords: ["payee", "recipient", "create payee", "add payee"],
				topics: ["create-payee", "create-payees"],
			},
			{
				category: "Setup",
				keywords: [
					"install",
					"setup",
					"configuration",
					"sdk",
					"initialize",
				],
				topics: ["setup-and-installation", "quickstart"],
			},
			{
				category: "Error Handling",
				keywords: ["error", "exception", "crash", "failed"],
				topics: ["error-handling", "api-reference"],
			},
		];

		const problemLower = problem.toLowerCase();
		const matchingCategories = problemCategories.filter((cat) =>
			cat.keywords.some((keyword) => problemLower.includes(keyword))
		);

		const topicsToConsult =
			matchingCategories.length > 0
				? matchingCategories.flatMap((cat) => cat.topics)
				: ["error-handling", "api-reference", "quickstart"];

		const uniqueTopics = [...new Set(topicsToConsult)];

		let solutionText = `# Solution for: "${problem}"\n\n`;

		if (matchingCategories.length > 0) {
			solutionText += `This appears to be a ${matchingCategories
				.map((c) => c.category)
				.join("/")} related issue.\n\n`;
		}

		if (sdk) {
			solutionText += `## ${sdk.toUpperCase()} SDK Specific Guidance\n\n`;
			solutionText += `When working with the ${sdk} SDK, make sure to:\n\n`;

			if (sdk === "nodejs") {
				solutionText += `- Check you're using the latest version: \`npm view @paymanai/sdk version\`\n`;
				solutionText += `- Update if needed: \`npm install @paymanai/sdk@latest\`\n`;
				solutionText += `- Verify your environment variables are set correctly\n`;
				solutionText += `- Use try/catch blocks to properly handle API errors\n\n`;
			} else {
				solutionText += `- Check you're using the latest version: \`pip show paymanai\`\n`;
				solutionText += `- Update if needed: \`pip install --upgrade paymanai\`\n`;
				solutionText += `- Handle exceptions properly with try/except blocks\n`;
				solutionText += `- Ensure your Python version is compatible (3.7+)\n\n`;
			}
		}

		solutionText += `## Troubleshooting Steps\n\n`;
		solutionText += `1. **Check your API credentials** - Verify your API key is valid and correctly formatted\n`;
		solutionText += `2. **Look for specific error codes** - Error codes provide detailed information about what went wrong\n`;
		solutionText += `3. **Check your request format** - Ensure all required parameters are included and properly formatted\n`;
		solutionText += `4. **Review rate limits** - Make sure you're not exceeding API rate limits\n\n`;

		solutionText += `## Relevant Documentation\n\n`;
		uniqueTopics.forEach((topic) => {
			solutionText += `- ${topicMetadata[topic].title}: use get-documentation with topic "${topic}"\n`;
		});

		return {
			content: [
				{
					type: "text",
					text: solutionText,
				},
			],
		};
	}
);

server.tool(
	"get-sdk-help",
	"Get help with Node.js or Python SDK usage",
	{
		sdk: z
			.enum(["nodejs", "python"])
			.describe("Which SDK you need help with"),
		feature: z
			.string()
			.describe("Which SDK feature or class you need help with"),
	},
	async ({ sdk, feature }) => {
		log(`Getting help for ${sdk} SDK feature: ${feature}`);

		const sdkTopics = [
			"setup-and-installation",
			"create-payees",
			"send-payments",
			"create-payee",
			"search-payees",
			"check-balances",
		];

		const helpPromises = sdkTopics.map(async (topic) => {
			const content = await fetchDocMarkdown(pathMap[topic]);

			const sdkIdentifier =
				sdk === "nodejs"
					? ["node", "nodejs", "javascript", "js"]
					: ["python", "py"];

			const relevance = sdkIdentifier.some(
				(id) =>
					content.toLowerCase().includes(id) &&
					content.toLowerCase().includes(feature.toLowerCase()) &&
					Math.abs(
						content.toLowerCase().indexOf(id) -
							content.toLowerCase().indexOf(feature.toLowerCase())
					) < 500
			);

			if (!relevance) return null;

			const lines = content.split("\n");
			const featureIndex = lines.findIndex((line) =>
				line.toLowerCase().includes(feature.toLowerCase())
			);

			if (featureIndex === -1) return null;

			let headingIndex = featureIndex;
			while (headingIndex > 0 && !lines[headingIndex].startsWith("#")) {
				headingIndex--;
			}

			const sectionHeading = lines[headingIndex];
			const sectionContent = lines
				.slice(headingIndex, featureIndex + 20)
				.join("\n");

			return {
				topic,
				heading: sectionHeading,
				content: sectionContent,
				relevance:
					(content.toLowerCase().includes(sdk) ? 2 : 1) +
					(sectionContent
						.toLowerCase()
						.includes(feature.toLowerCase())
						? 3
						: 0),
			};
		});

		const helpResults = (await Promise.all(helpPromises)).filter(Boolean);

		helpResults.sort((a, b) => (b?.relevance || 0) - (a?.relevance || 0));

		if (helpResults.length === 0) {
			return {
				content: [
					{
						type: "text",
						text: `No specific help found for ${feature} in the ${sdk} SDK. Try checking the full SDK documentation with get-documentation or using more generic terms.`,
					},
				],
			};
		}

		let helpText = `# ${sdk.toUpperCase()} SDK Help: ${feature}\n\n`;

		helpResults.forEach((result) => {
			if (!result) return;
			helpText += `## From ${topicMetadata[result.topic].title}\n\n`;
			helpText += `${result.content}\n\n`;
			helpText += `*For complete documentation, use get-documentation with topic "${result.topic}"*\n\n---\n\n`;
		});

		helpText += `## Additional Resources\n\n`;
		helpText += `- Setup and Installation: use get-documentation with topic "setup-and-installation"\n`;
		helpText += `- Error Handling: use get-documentation with topic "error-handling"\n`;
		helpText += `- For code examples, try the get-code-examples tool with feature="${feature}" and language="${sdk}"\n`;

		return {
			content: [
				{
					type: "text",
					text: helpText,
				},
			],
		};
	}
);

server.resource("payman-overview", "Overview of PaymanAI", async (request) => {
	const content = await fetchDocMarkdown("/overview/quickstart");
	return {
		contents: [
			{
				text: content,
				uri: "overview.md",
				mimeType: "text/markdown",
			},
		],
	};
});

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	log("PaymanAI MCP Server running on stdio");
}

main().catch((error) => {
	console.error("Fatal error in main():", error);
	process.exit(1);
});
