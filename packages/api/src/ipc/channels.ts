export const IpcChannels = {
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_DESTROY: 'terminal:destroy',
  TERMINAL_LIST: 'terminal:list',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_GET_SESSION: 'terminal:getSession',
  SHELL_DISCOVER: 'shell:discover',
  SHELL_GET_DEFAULT: 'shell:getDefault',
  COMMAND_EXECUTE: 'command:execute',
  COMMAND_LIST: 'command:list',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
} as const;

export const IpcEventChannels = {
  PTY_DATA: 'pty:data',
  PTY_INPUT: 'pty:input',
  EVENT_BROADCAST: 'event:broadcast',
} as const;
