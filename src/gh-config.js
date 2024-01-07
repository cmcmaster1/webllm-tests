export default {
	"model_list": [
		{
			"model_url": "https://huggingface.co/mlc-ai/mlc-chat-RedPajama-INCITE-Chat-3B-v1-q4f32_1/resolve/main/",
			"local_id": "RedPajama-INCITE-Chat-3B-v1-q4f32_1",
		},
		{
			"model_url": "https://huggingface.co/mlc-ai/mlc-chat-Mistral-7B-Instruct-v0.1-q4f32_1/resolve/main/",
			"local_id": "Mistral-7B-Instruct-v0.1-q4f32_1",
		},
		{
			"model_url": "https://huggingface.co/cmcmaster/rheumchat-webgpu-q4f32_1/resolve/main/",
			"local_id": "RheumChat",
		}
	],
	"model_lib_map": {
		"RedPajama-INCITE-Chat-3B-v1-q4f32_1": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/RedPajama-INCITE-Chat-3B-v1-q4f32_1-webgpu.wasm",
		"Mistral-7B-Instruct-v0.1-q4f32_1": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/Mistral-7B-Instruct-v0.1-q4f32_1-sw4096_cs1024-webgpu.wasm",
		"RheumChat": "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/Mistral-7B-Instruct-v0.1-q4f32_1-sw4096_cs1024-webgpu.wasm"
	},
	"use_web_worker": true
}