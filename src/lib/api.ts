export class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;
  constructor(message: string, status: number, payload: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.endsWith('/login')) {
    if (!location.hash.startsWith('#/login')) location.hash = '#/login';
    throw new ApiError('nao_autenticado', 401, body);
  }
  if (!res.ok) throw new ApiError(String(body.error || 'erro'), res.status, body);
  return body as T;
}

const MESSAGES: Record<string, string> = {
  dominio_obrigatorio: 'Informe o domínio.',
  nome_obrigatorio: 'Informe o nome.',
  titulo_obrigatorio: 'Informe o título.',
  data_invalida: 'Data inválida.',
  valor_invalido: 'O valor precisa ser maior que zero.',
  categoria_invalida: 'Escolha uma categoria.',
  categoria_incompativel: 'Essa categoria não combina com entrada/saída.',
  senha_atual_incorreta: 'Senha atual incorreta.',
  senha_curta: 'A senha precisa ter ao menos 8 caracteres.',
  email_ja_existe: 'Já existe alguém com esse e-mail.',
  dados_incompletos: 'Preencha os campos obrigatórios.',
  registro_nao_encontrado: 'Registro não encontrado — talvez alguém já tenha apagado.',
  setor_com_tarefas: 'Mova ou conclua as demandas desse setor antes de excluí-lo.',
  ultimo_owner: 'Precisa existir pelo menos um owner ativo.',
  sem_permissao: 'Você não tem acesso a esse módulo.',
  muitas_tentativas: 'Muitas tentativas. Aguarde alguns minutos.',
  erro_interno: 'Erro no servidor. Tente novamente.',
};

export const errorMessage = (e: unknown) => {
  const key = e instanceof Error ? e.message : '';
  return MESSAGES[key] || 'Não foi possível concluir. Tente de novo.';
};
