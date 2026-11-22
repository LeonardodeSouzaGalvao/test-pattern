import { CheckoutService } from '../src/services/CheckoutService.js';
import { Pedido } from '../src/domain/Pedido.js';
import { Item } from '../src/domain/Item.js';
import { UserMother } from './builders/UserMother.js';
import { CarrinhoBuilder } from './builders/CarrinhoBuilder.js';

describe('CheckoutService', () => {
    const cartao = { numero: '4111111111111111' };


    describe('quando o pagamento falha', () => {
        let gatewayStub, repositoryMock, emailMock, pedido;

        beforeEach(async () => {
            // Arrange
            const carrinho = new CarrinhoBuilder().build();
            gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: false }) };
            repositoryMock = { salvar: jest.fn() };
            emailMock = { enviarEmail: jest.fn() };
            const sut = new CheckoutService(gatewayStub, repositoryMock, emailMock);

            // Act
            pedido = await sut.processarPedido(carrinho, cartao);
        });

        it('retorna null (verificação de estado)', () => {
            // Assert
            expect(pedido).toBeNull();
        });

        it('não salva o pedido nem envia e-mail (verificação de comportamento)', () => {
            expect(repositoryMock.salvar).not.toHaveBeenCalled();
            expect(emailMock.enviarEmail).not.toHaveBeenCalled();
        });
    });

    describe('quando um cliente padrão finaliza a compra', () => {
        it('retorna o pedido salvo com o total sem desconto', async () => {
            // Arrange
            const carrinho = new CarrinhoBuilder()
                .comUser(UserMother.umUsuarioPadrao())
                .comItens([new Item('Livro', 50), new Item('Caneta', 50)])
                .build();
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const pedidoSalvo = new Pedido(10, carrinho, 100, 'PROCESSADO');
            const repositoryStub = { salvar: jest.fn().mockResolvedValue(pedidoSalvo) };
            const emailStub = { enviarEmail: jest.fn().mockResolvedValue() };
            const sut = new CheckoutService(gatewayStub, repositoryStub, emailStub);

            // Act
            const resultado = await sut.processarPedido(carrinho, cartao);

            // Assert (estado)
            expect(resultado).toBe(pedidoSalvo);
            expect(resultado.totalFinal).toBe(100);
            expect(resultado.status).toBe('PROCESSADO');
        });
    });

    describe('quando um cliente Premium finaliza a compra', () => {
        let gatewayStub, repositoryStub, emailMock, pedidoSalvo, resultado;

        beforeEach(async () => {
            // Arrange
            const premium = UserMother.umUsuarioPremium();
            const carrinho = new CarrinhoBuilder()
                .comUser(premium)
                .comItens([new Item('Fone', 120), new Item('Cabo', 80)]) // R$ 200,00
                .build();

            gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            pedidoSalvo = new Pedido(99, carrinho, 180, 'PROCESSADO');
            repositoryStub = { salvar: jest.fn().mockResolvedValue(pedidoSalvo) };
            emailMock = { enviarEmail: jest.fn().mockResolvedValue() };
            const sut = new CheckoutService(gatewayStub, repositoryStub, emailMock);

            // Act
            resultado = await sut.processarPedido(carrinho, cartao);
        });

        it('cobra o valor com 10% de desconto', () => {
            // Assert (comportamento)
            expect(gatewayStub.cobrar).toHaveBeenCalledWith(180, cartao);
        });

        it('envia exatamente um e-mail de aprovação com os dados corretos', () => {
            expect(emailMock.enviarEmail).toHaveBeenCalledTimes(1);
            expect(emailMock.enviarEmail).toHaveBeenCalledWith(
                'premium@email.com',
                'Seu Pedido foi Aprovado!',
                'Pedido 99 no valor de R$180'
            );
        });

        it('retorna o pedido salvo', () => {
            expect(resultado).toBe(pedidoSalvo);
        });
    });

    describe('quando o envio de e-mail falha', () => {
        it('ainda retorna o pedido salvo', async () => {
            // Arrange
            const carrinho = new CarrinhoBuilder().build();
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const pedidoSalvo = new Pedido(1, carrinho, 100, 'PROCESSADO');
            const repositoryStub = { salvar: jest.fn().mockResolvedValue(pedidoSalvo) };
            const emailStub = { enviarEmail: jest.fn().mockRejectedValue(new Error('SMTP fora do ar')) };
            const sut = new CheckoutService(gatewayStub, repositoryStub, emailStub);
            const erroSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            // Act
            const resultado = await sut.processarPedido(carrinho, cartao);

            // Assert
            expect(resultado).toBe(pedidoSalvo);
            erroSpy.mockRestore();
        });
    });
});
