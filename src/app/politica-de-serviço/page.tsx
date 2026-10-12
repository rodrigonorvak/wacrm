import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Termos de Serviço",
  description: "Termos de Serviço do CRM Integrado Malybo.",
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

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-6 sm:py-16">
      <article className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10">
        <header className="border-b border-border pb-8">
          <p className="text-sm font-semibold text-primary">CRM Integrado Malybo</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Termos de Serviço
          </h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Última atualização: {lastUpdated}
          </p>
        </header>

        <div className="mt-8 space-y-10">
          <Section title="1. Aceitação dos termos">
            <p>
              Estes Termos de Serviço regulam o acesso e o uso do CRM Integrado
              Malybo. Ao criar uma conta, aceitar um convite ou utilizar o
              serviço, você declara que leu e concorda com estes termos.
            </p>
            <p>
              O serviço é operado por Rodrigo Raimundo de Lima, inscrito no
              CNPJ sob o nº 66.570.915/0001-40, doravante denominado “Malybo”.
            </p>
          </Section>

          <Section title="2. O serviço">
            <p>
              O CRM Integrado Malybo disponibiliza recursos de gestão de
              contatos, oportunidades, conversas, automações, campanhas,
              integrações e atividades relacionadas ao relacionamento com
              clientes.
            </p>
            <p>
              Alguns recursos podem depender de serviços de terceiros, de
              configurações específicas ou de planos contratados. A
              disponibilidade de funcionalidades poderá ser alterada,
              aprimorada, suspensa ou descontinuada quando necessário.
            </p>
          </Section>

          <Section title="3. Contas, acessos e responsabilidades">
            <p>
              Você deve fornecer informações verdadeiras e manter suas
              credenciais protegidas. É responsável pelas atividades realizadas
              em sua conta e por assegurar que usuários convidados pela sua
              organização utilizem o serviço de forma autorizada.
            </p>
            <p>
              Você deve comunicar imediatamente qualquer suspeita de acesso não
              autorizado pelo e-mail{" "}
              <a
                className="font-medium text-primary underline underline-offset-4"
                href="mailto:rodrigodelima.gestor@gmail.com"
              >
                rodrigodelima.gestor@gmail.com
              </a>
              .
            </p>
          </Section>

          <Section title="4. Dados e conformidade">
            <p>
              Você é responsável pelos dados inseridos no CRM, pelas bases
              legais aplicáveis ao seu tratamento e pela obtenção das
              autorizações necessárias de contatos, colaboradores e clientes.
              Isso inclui o envio de mensagens, campanhas e conteúdos por meio
              de integrações configuradas por sua organização.
            </p>
            <p>
              Para os dados cadastrados por clientes no CRM, o cliente atua
              como controlador e a Malybo atua como operadora, conforme
              detalhado na Política de Privacidade.
            </p>
          </Section>

          <Section title="5. Uso aceitável">
            <p>Você não pode utilizar o serviço para:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>violar leis, regulamentos ou direitos de terceiros;</li>
              <li>
                enviar spam, conteúdo enganoso, malicioso, ofensivo ou não
                solicitado;
              </li>
              <li>
                obter acesso não autorizado, interferir na segurança ou
                contornar limitações técnicas do serviço;
              </li>
              <li>
                transmitir código malicioso ou utilizar o CRM para atividades
                fraudulentas;
              </li>
              <li>
                usar dados pessoais sem uma base legal válida ou em desacordo
                com a LGPD.
              </li>
            </ul>
          </Section>

          <Section title="6. Integrações de terceiros">
            <p>
              Integrações com WhatsApp, provedores de e-mail, plataformas de
              formulários ou outros serviços de terceiros estão sujeitas aos
              termos e políticas desses respectivos fornecedores. Você é
              responsável por manter as credenciais, autorizações e
              configurações dessas integrações válidas.
            </p>
          </Section>

          <Section title="7. Disponibilidade e limitações">
            <p>
              Empregamos esforços razoáveis para manter o serviço disponível,
              mas não garantimos operação ininterrupta ou isenta de falhas.
              Manutenções, atualizações, falhas de fornecedores externos,
              indisponibilidades de rede e eventos fora de nosso controle podem
              afetar temporariamente o funcionamento do CRM.
            </p>
          </Section>

          <Section title="8. Suspensão ou encerramento">
            <p>
              Poderemos suspender ou encerrar acessos que violem estes termos,
              apresentem risco à segurança, sejam exigidos por lei ou
              comprometam a operação do serviço. Você pode deixar de utilizar
              o CRM a qualquer momento, observadas eventuais obrigações
              contratuais, legais ou de retenção aplicáveis.
            </p>
          </Section>

          <Section title="9. Alterações destes termos">
            <p>
              Estes termos poderão ser atualizados periodicamente. A versão
              atual estará disponível nesta página e entrará em vigor na data
              de sua publicação. O uso continuado do serviço após uma
              atualização representa a concordância com a versão revisada.
            </p>
          </Section>

          <Section title="10. Contato">
            <p>
              Dúvidas sobre estes termos podem ser enviadas para{" "}
              <a
                className="font-medium text-primary underline underline-offset-4"
                href="mailto:rodrigodelima.gestor@gmail.com"
              >
                rodrigodelima.gestor@gmail.com
              </a>
              .
            </p>
          </Section>
        </div>

        <footer className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
          Consulte também a{" "}
          <Link
            href="/politica-de-privacidade"
            className="font-medium text-primary underline underline-offset-4"
          >
            Política de Privacidade
          </Link>
          .
        </footer>
      </article>
    </main>
  );
}
