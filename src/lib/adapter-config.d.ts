// This file extends the AdapterConfig type from "@iobroker/types"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface AdapterConfig {
			port: number;
			bindAddress: string;
			webTransport: 'http' | 'https';
			allowInsecureHttpLan: boolean;
			allowInsecureDataApiOverHttp: boolean;
			tlsCertificateSource: 'iobroker' | 'collection' | 'pem' | 'files';
			certPublic: string;
			certPrivate: string;
			certChained: string;
			tlsCollectionId: string;
			tlsCertPem: string;
			tlsKeyPem: string;
			tlsCertFile: string;
			tlsKeyFile: string;
			tlsChainFile: string;
			uiPassword: string;
			datapointApiDevelopmentMode: boolean;
			datapointApiAllowedPatterns: string;
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
