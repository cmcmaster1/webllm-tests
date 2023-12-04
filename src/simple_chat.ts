import appConfig from "./gh-config";
import { ChatInterface, ChatModule, ChatRestModule, ChatWorkerClient, ModelRecord } from "@mlc-ai/web-llm";

function getElementAndCheck(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element == null) {
    throw Error("Cannot find element " + id);
  }
  return element;
}

interface AppConfig {
  model_list: Array<ModelRecord>;
  model_lib_map?: Record<string, string>;
}

class ChatUI {
  private uiChat: HTMLElement;
  private uiChatInput: HTMLInputElement;
  private uiChatInfoLabel: HTMLLabelElement;
  private chat: ChatInterface;
  private localChat: ChatInterface;
  private config: AppConfig = appConfig;
  private selectedModel: string;
  private chatLoaded = false;
  private requestInProgress = false;
  // We use a request chain to ensure that
  // all requests send to chat are sequentialized
  private chatRequestChain: Promise<void> = Promise.resolve();
  private chatHistory: Array<{ prompt: string, originalResponse: string, editedResponse: string | null }> = [];

  constructor(chat: ChatInterface, localChat: ChatInterface) {
    // use web worker to run chat generation in background
    this.chat = chat;
    this.localChat = localChat;
    // get the elements
    this.uiChat = getElementAndCheck("chatui-chat");
    this.uiChatInput = getElementAndCheck("chatui-input") as HTMLInputElement;
    this.uiChatInfoLabel = getElementAndCheck("chatui-info-label") as HTMLLabelElement;
    // register event handlers
    getElementAndCheck("chatui-reset-btn").onclick = () => {
      this.onReset();
    };
    getElementAndCheck("chatui-send-btn").onclick = () => {
      this.onGenerate();
    };
    // TODO: find other alternative triggers
    getElementAndCheck("chatui-input").onkeypress = (event) => {
      if (event.keyCode === 13) {
        this.onGenerate();
      }
    };

    const modelSelector = getElementAndCheck("chatui-select") as HTMLSelectElement;
    for (let i = 0; i < this.config.model_list.length; ++i) {
      const item = this.config.model_list[i];
      const opt = document.createElement("option");
      opt.value = item.local_id;
      opt.innerHTML = item.local_id;
      opt.selected = (i == 0);
      modelSelector.appendChild(opt);
    }
    // Append local server option to the model selector
    const localServerOpt = document.createElement("option");
    localServerOpt.value = "Local Server";
    localServerOpt.innerHTML = "Local Server";
    modelSelector.append(localServerOpt);
    this.selectedModel = modelSelector.value;
    modelSelector.onchange = () => {
      this.onSelectChange(modelSelector);
    };
  }
  // Add this method to handle the edit button click event
  private onEditResponse(editButton: HTMLButtonElement, responseDiv: HTMLElement, messageIndex: number) {
    responseDiv.contentEditable = 'true';
    responseDiv.focus();
    editButton.textContent = 'Save';
    editButton.onclick = () => this.onSaveResponse(editButton, responseDiv, messageIndex);
  }
  
  private onSaveResponse(editButton: HTMLButtonElement, responseDiv: HTMLElement, messageIndex: number) {
    responseDiv.contentEditable = 'false';
    this.chatHistory[messageIndex].editedResponse = responseDiv.innerText;
    responseDiv.classList.add("edited");
    editButton.textContent = 'Edit';
    editButton.onclick = () => this.onEditResponse(editButton, responseDiv, messageIndex);
  }
  /**
   * Push a task to the execution queue.
   *
   * @param task The task to be executed;
   */
  private pushTask(task: ()=>Promise<void>) {
    const lastEvent = this.chatRequestChain;
    this.chatRequestChain = lastEvent.then(task);
  }
  // Event handlers
  // all event handler pushes the tasks to a queue
  // that get executed sequentially
  // the tasks previous tasks, which causes them to early stop
  // can be interrupted by chat.interruptGenerate
  private async onGenerate() {
    if (this.requestInProgress) {
      return;
    }
    this.pushTask(async () => {
      await this.asyncGenerate();
    });
  }

  private async onSelectChange(modelSelector: HTMLSelectElement) {
    if (this.requestInProgress) {
      // interrupt previous generation if any
      this.chat.interruptGenerate();
    }
    // try reset after previous requests finishes
    this.pushTask(async () => {
      await this.chat.resetChat();
      this.resetChatHistory();
      await this.unloadChat();
      this.selectedModel = modelSelector.value;
      await this.asyncInitChat();
    });
  }

  private async onReset() {
    if (this.requestInProgress) {
      // interrupt previous generation if any
      this.chat.interruptGenerate();
    }
    // try reset after previous requests finishes
    this.pushTask(async () => {
      await this.chat.resetChat();
      this.resetChatHistory();
    });
  }

  // Internal helper functions
  private appendMessage(kind, text) {
    if (kind == "init") {
      text = "[System Initalize] " + text;
    }
    if (this.uiChat === undefined) {
      throw Error("cannot find ui chat");
    }

    const msgDiv = document.createElement("div");
    msgDiv.className = `msg ${kind}-msg`;

    const bubbleDiv = document.createElement("div");
    bubbleDiv.className = "msg-bubble";

    const textDiv = document.createElement("div");
    textDiv.className = "msg-text";
    textDiv.textContent = text;

    bubbleDiv.appendChild(textDiv);
    msgDiv.appendChild(bubbleDiv);
    

    const messageIndex = this.chatHistory.length;

    if (kind === "left") { // Assuming 'left' is for bot responses
      const editButton = document.createElement("button");
      editButton.textContent = "Edit";
      editButton.className = "edit-btn";
      editButton.addEventListener('click', () => this.toggleEdit(textDiv, editButton, messageIndex));
      msgDiv.appendChild(editButton);
    }
  
    this.uiChat.appendChild(msgDiv);
    this.uiChat.scrollTo(0, this.uiChat.scrollHeight);
  }

  // New method to toggle edit mode
  private toggleEdit(textDiv: HTMLElement, editButton: HTMLButtonElement, messageIndex: number) {
    const isEditable = textDiv.contentEditable === "true";
  
    if (isEditable) {
      // Switching from 'Save' to 'Edit'
      textDiv.contentEditable = "false";
      textDiv.classList.add("edited"); // This will turn the text red
      editButton.textContent = "Edit";
      this.chatHistory[messageIndex].editedResponse = textDiv.innerText;
    } else {
      // Switching from 'Edit' to 'Save'
      textDiv.contentEditable = "true";
      textDiv.classList.remove("edited"); // Remove red color while editing
      editButton.textContent = "Save";
    }
  }
  
  

  public exportChatHistory() {
    const historyBlob = new Blob([JSON.stringify(this.chatHistory, null, 2)], { type: 'application/json' });
    const historyUrl = URL.createObjectURL(historyBlob);

    const downloadLink = document.createElement("a");
    downloadLink.href = historyUrl;
    downloadLink.download = "chat_history.json";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }

  private updateLastMessage(kind, text) {
    if (kind == "init") {
      text = "[System Initalize] " + text;
    }
    if (this.uiChat === undefined) {
      throw Error("cannot find ui chat");
    }
    const matches = this.uiChat.getElementsByClassName(`msg ${kind}-msg`);
    if (matches.length == 0) throw Error(`${kind} message do not exist`);
    const msg = matches[matches.length - 1];
    const msgText = msg.getElementsByClassName("msg-text");
    if (msgText.length != 1) throw Error("Expect msg-text");
    if (msgText[0].innerHTML == text) return;
    const list = text.split('\n').map((t) => {
      const item = document.createElement('div');
      item.textContent = t;
      return item;
    });
    msgText[0].innerHTML = '';
    list.forEach((item) => msgText[0].append(item));
    this.uiChat.scrollTo(0, this.uiChat.scrollHeight);
  }

  private resetChatHistory() {
    const clearTags = ["left", "right", "init", "error"];
    for (const tag of clearTags) {
      // need to unpack to list so the iterator don't get affected by mutation
      const matches = [...this.uiChat.getElementsByClassName(`msg ${tag}-msg`)];
      for (const item of matches) {
        this.uiChat.removeChild(item);
      }
    }
    if (this.uiChatInfoLabel !== undefined) {
      this.uiChatInfoLabel.innerHTML = "";
    }
  }

  private async asyncInitChat() {
    if (this.chatLoaded) return;
    this.requestInProgress = true;
    this.appendMessage("init", "");
    const initProgressCallback = (report) => {
      this.updateLastMessage("init", report.text);
    }
    this.chat.setInitProgressCallback(initProgressCallback);

    try {
      if (this.selectedModel != "Local Server") {
        await this.chat.reload(this.selectedModel, undefined, this.config);
      }
    } catch (err) {
      this.appendMessage("error", "Init error, " + err.toString());
      console.log(err.stack);
      this.unloadChat();
      this.requestInProgress = false;
      return;
    }
    this.requestInProgress = false;
    this.chatLoaded = true;
  }

  private async unloadChat() {
    await this.chat.unload();
    this.chatLoaded = false;
  }
  

  /**
   * Run generate
   */
  private async asyncGenerate() {
    await this.asyncInitChat();
    this.requestInProgress = true;
    const prompt = this.uiChatInput.value;
    if (prompt == "") {
      this.requestInProgress = false;
      return;
    }
  
    // Append the user's prompt to the chat
    this.appendMessage("right", prompt);
  
    // Prepare to append the response (but with no text yet)
    const messageIndex = this.chatHistory.length; // Get the next index
    this.appendMessage("left", ""); // Append an empty 'left' message
  
    try {
      let output;
      if (this.selectedModel == "Local Server") {
        output = await this.localChat.generate(prompt, undefined); // Removed the callback for simplicity
        this.uiChatInfoLabel.innerHTML = await this.localChat.runtimeStatsText();
      } else {
        output = await this.chat.generate(prompt, undefined); // Removed the callback for simplicity
        this.uiChatInfoLabel.innerHTML = await this.chat.runtimeStatsText();
      }
  
      // Update the last 'left' message with the actual response
      this.updateLastMessage("left", output);
  
      // Record the interaction in the chat history
      this.chatHistory.push({
        prompt: prompt,
        originalResponse: output,
        editedResponse: null
      });
  
    } catch (err) {
      this.appendMessage("error", "Generate error, " + err.toString());
      console.log(err.stack);
      await this.unloadChat();
    }
  
    this.uiChatInput.value = "";
    this.uiChatInput.setAttribute("placeholder", "Enter your message...");
    this.requestInProgress = false;
  }
  
}

// ... (existing imports and declarations)

const useWebWorker = appConfig.use_web_worker;
let chat: ChatInterface;
let localChat: ChatInterface;

if (useWebWorker) {
  chat = new ChatWorkerClient(new Worker(
    new URL('./worker.ts', import.meta.url),
    {type: 'module'}
  ));
  localChat = new ChatRestModule();
} else {
  chat = new ChatModule();
  localChat = new ChatRestModule();
}

// Store the instance in a variable
const chatUIInstance = new ChatUI(chat, localChat);

// Set up the event listener for the export button
document.addEventListener('DOMContentLoaded', () => {
  const exportButton = document.getElementById('export-history-btn');
  if (exportButton) {
    exportButton.addEventListener('click', () => {
      chatUIInstance.exportChatHistory();
    });
  }
});
