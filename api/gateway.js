
export default async function handler(req, res) {
    // Configuração da API (extraída do nlo-config.php)
    const GATEWAY_API_URL = "https://www.pagamentos-seguros.app/api-pix/8u0fKdh4IwSCRqyAmNAPnpfanV3-Mo0TM1W2jWk37_UHSZvG3hgbzY_a_noF54x4DxHb4tov_zwY1VxD2jCJSA";

    // CORS configuration
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { acao, ...queryParams } = req.query;

    if (!acao) {
        return res.status(400).json({ erro: 1, erroMsg: "Ação não especificada" });
    }

    try {
        let result;

        if (acao === "criar") {
            const {
                nome, email, telefone, cpf,
                utm, valor
            } = queryParams;

            const up = queryParams.up ? parseInt(queryParams.up) : null;
            let ofertaNome = "Depósito"; // Default nome_front
            const nome_up = "Depósito Bônus"; // Default nome_up from config

            const oferta = queryParams.oferta || "tiktok";

            if (!nome || !telefone || !cpf) {
                return res.status(400).json({ erro: 1, erroMsg: "Parâmetro(s) obrigatório(s) faltando" });
            }

            // Lógica de definição do nome da oferta baseada em 'up'
            if (oferta === "tiktok") {
                if (up) {
                    ofertaNome = `${nome_up} ${up}`;
                }
            }

            // Formatação do valor (remove pontos e converte para centavos/inteiro conforme lógica original php)
            // PHP logic: $valor = number_format($valor, 2, '.', ''); $valor = str_replace('.', '', $valor); $valor = (int)$valor;
            // JS equivalent:
            let valorFormatado = parseFloat(valor).toFixed(2).replace('.', '');
            valorFormatado = parseInt(valorFormatado);

            // Lógica para limpar o UTM (extrair apenas o valor do utm_source se vier como query string)
            let utmClean = utm;
            if (utm && (utm.includes('%3D') || utm.includes('='))) {
                try {
                    // Tenta decodificar se estiver encoded
                    let decodedUtm = decodeURIComponent(utm);
                    // Se ainda tiver encoding (double encoded), tenta de novo
                    if (decodedUtm.includes('%3D')) {
                        decodedUtm = decodeURIComponent(decodedUtm);
                    }

                    // Procura por utm_source=VALOR
                    if (decodedUtm.includes('utm_source=')) {
                        const params = new URLSearchParams(decodedUtm);
                        const source = params.get('utm_source');
                        if (source) {
                            utmClean = `utm_source=${source}`;
                        }
                    } else if (decodedUtm.includes('=')) {
                        // Se não tem utm_source explícito mas tem =, assume que é query string e processa
                        const params = new URLSearchParams(decodedUtm);
                        const source = params.get('utm_source');
                        if (source) {
                            utmClean = `utm_source=${source}`;
                        }
                    }
                } catch (e) {
                    console.error("Erro ao limpar UTM:", e);
                }
            } else if (utm && !utm.includes('utm_source=')) {
                // Se veio apenas o código (ex: TT-...), adiciona o prefixo
                utmClean = `utm_source=${utm}`;
            }

            const postfields = {
                utm: utmClean,
                item: {
                    price: valorFormatado,
                    title: ofertaNome,
                    quantity: 1
                },
                amount: valorFormatado,
                customer: {
                    name: nome,
                    email: email,
                    phone: telefone,
                    document: cpf
                },
                description: "Pagamento via Pix",
                paymentMethod: "PIX"
            };

            const response = await fetch(GATEWAY_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(postfields)
            });

            result = await response.json();

            // Adaptation of PHP response handling
            if (result.transactionId) {
                return res.status(200).json({
                    payment_id: result.transactionId,
                    pixCode: result.pixCode,
                    status: result.status
                });
            } else if (result.message) {
                return res.status(200).json({
                    erro: 1,
                    erroMsg: result.message,
                    erroCode: result.code
                });
            } else {
                return res.status(200).json({
                    erro: 1,
                    erroMsg: "API retornou id nulo ou resposta inesperada",
                    detalhes: JSON.stringify(result)
                });
            }

        } else if (acao === "verificar") {
            const { payment_id } = queryParams;

            if (!payment_id) {
                return res.status(400).json({ erro: 1, erroMsg: "Parâmetro obrigatório faltando" });
            }

            const verifyUrl = `${GATEWAY_API_URL}?transactionId=${payment_id}`;

            const response = await fetch(verifyUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            result = await response.json();

            if (!result.error) {
                if (result.status) {
                    return res.status(200).json({ status: result.status });
                } else {
                    return res.status(200).json({
                        erro: 1,
                        erroMsg: "Status não encontrado na resposta",
                        detalhes: JSON.stringify(result)
                    });
                }
            } else {
                return res.status(200).json({
                    erro: 1,
                    erroMsg: "Erro: " + result.error,
                    detalhes: JSON.stringify(result)
                });
            }

        } else {
            return res.status(400).json({ erro: 1, erroMsg: "Ação não encontrada." });
        }

    } catch (error) {
        console.error("Erro no gateway:", error);
        return res.status(500).json({
            erro: 1,
            erroMsg: "Erro interno no servidor: " + error.message
        });
    }
}
