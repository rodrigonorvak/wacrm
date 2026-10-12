import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Política de Privacidade do CRM Integrado Malybo.",
  robots: {
    index: true,
    follow: true,
  },
};

const lastUpdated = "11 de outubro de 2026";

function Section({
  title,
  children,
}: Readonly<{
  title: string;
  children: React.ReactNode;
}>) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-7 text-muted-foreground sm:text-base">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-6 sm:py-16">
      <article className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10">
        <header className="border-b border-border pb-8">
          <p className="text-sm font-semibold text-primary">CRM Integrado Malybo</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Política de Privacidade
          </h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Última atualização: {lastUpdated}
          </p>
        </header>

        <div className="mt-8 space-y-10">
          <Section title="1. Quem somos">
            <p>
              Esta Política de Privacidade explica como o CRM Integrado Malybo
              trata dados pessoais. O serviço é operado por Rodrigo Raimundo de
              Lima, inscrito no CNPJ sob o nº 66.570.915/0001-40, doravante
              denominado “Malybo”.
            </p>
            <p>
              Para assuntos relacionados a privacidade e proteção de dados,
              entre em contato pelo e-mail{" "}
              <a
                className="font-medium text-primary underline underline-offset-4"
                href="mailto:rodrigodelima.gestor@gmail.com"
              >
                rodrigodelima.gestor@gmail.com
              </a>
              .
            </p>
          </Section>

          <Section title="2. Papéis no tratamento de dados">
            <p>
              Para dados inseridos no CRM por empresas clientes, incluindo
              dados de contatos, conversas, oportunidades e campanhas, cada
              cliente atua como controlador e define as finalidades do
              tratamento. Nesses casos, a Malybo atua como operadora, tratando
              os dados em nome e conforme as instruções do cliente.
            </p>
            <p>
              A Malybo atua como controladora dos dados necessários para criar,
              administrar e proteger as contas de seus próprios usuários, tais
              como dados cadastrais, de acesso, suporte e faturamento, quando
              aplicável.
            </p>
          </Section>

          <Section title="3. Dados que podemos tratar">
            <p>Conforme a forma de uso do serviço, podemos tratar:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>nome, e-mail, telefone e informações de perfil de usuários;</li>
              <li>credenciais de autenticação e registros de acesso;</li>
              <li>
                dados de contatos, negócios, mensagens e campos cadastrados
                pelos clientes no CRM;
              </li>
              <li>
                informações técnicas, como endereço IP, navegador, dispositivo,
                data e hora de acesso;
              </li>
              <li>solicitações enviadas ao suporte e configurações do serviço.</li>
            </ul>
          </Section>

          <Section title="4. Finalidades e bases legais">
            <p>
              Tratamos dados pessoais para fornecer, autenticar, manter e
              melhorar o CRM; atender solicitações de suporte; prevenir fraudes
              e incidentes de segurança; cumprir obrigações legais e
              regulatórias; e exercer direitos em processos administrativos ou
              judiciais.
            </p>
            <p>
              As bases legais aplicáveis podem incluir execução de contrato,
              cumprimento de obrigação legal ou regulatória, exercício regular
              de direitos, legítimo interesse e consentimento, quando
              necessário.
            </p>
          </Section>

          <Section title="5. Compartilhamento de dados">
            <p>
              Podemos compartilhar dados com provedores necessários para a
              operação do serviço, tais como hospedagem, banco de dados,
              autenticação, comunicação e suporte. Esses fornecedores recebem
              apenas os dados necessários para suas atividades e devem adotar
              medidas de proteção compatíveis.
            </p>
            <p>
              Também poderemos compartilhar dados quando exigido por lei, por
              autoridade competente ou para proteger direitos, segurança e
              integridade da Malybo, de seus clientes e usuários.
            </p>
          </Section>

          <Section title="6. Armazenamento, retenção e segurança">
            <p>
              Adotamos medidas técnicas e organizacionais razoáveis para
              proteger os dados contra acessos não autorizados, perda,
              alteração, divulgação ou destruição indevida. Nenhum sistema é
              totalmente infalível; por isso, usuários e clientes também devem
              manter suas credenciais protegidas e limitar o acesso às contas.
            </p>
            <p>
              Os dados são mantidos pelo período necessário para atender às
              finalidades descritas nesta política, às instruções do cliente
              controlador e às obrigações legais aplicáveis. Após esse período,
              poderão ser excluídos ou anonimizados, salvo hipótese legal de
              retenção.
            </p>
          </Section>

          <Section title="7. Direitos dos titulares">
            <p>
              Nos termos da Lei Geral de Proteção de Dados Pessoais (LGPD), os
              titulares podem solicitar confirmação da existência de
              tratamento, acesso, correção, anonimização, bloqueio, eliminação,
              portabilidade, informação sobre compartilhamentos e revisão de
              decisões automatizadas, quando aplicável.
            </p>
            <p>
              Quando a Malybo atuar como operadora, solicitações relacionadas a
              dados de contatos e conversas devem ser direcionadas inicialmente
              ao cliente que os inseriu no CRM, pois ele é o controlador
              responsável pelas decisões sobre esses dados.
            </p>
          </Section>

          <Section title="8. Alterações nesta política">
            <p>
              Esta política poderá ser atualizada para refletir mudanças no
              serviço, na legislação ou nas práticas de tratamento de dados. A
              versão vigente estará sempre disponível nesta página, com a data
              da última atualização.
            </p>
          </Section>
        </div>

        <footer className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
          Consulte também os{" "}
          <Link
            href="/politica-de-serviço"
            className="font-medium text-primary underline underline-offset-4"
          >
            Termos de Serviço
          </Link>
          .
        </footer>
      </article>
    </main>
  );
}
