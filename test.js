import test from 'ava';
import CanCan from '.';

class Model {
    constructor(attrs = {}) {
        this.attrs = attrs;
    }

    get(key) {
        return this.attrs[key];
    }
}

class User extends Model {}
class Product extends Model {}

function delay(t, val) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(val);
        }, t);
    });
}

test('allow one action', async (t) => {
    const cancan = new CanCan();
    const {can, allow, cannot} = cancan;

    allow(User, 'read', Product);

    const user = new User();
    const product = new Product();

    t.true(await can(user, 'read', product));
    t.false(await cannot(user, 'read', product));
    t.false(await can(user, 'create', product));
});

test('allow many actions', async (t) => {
    const cancan = new CanCan();
    const {can, allow} = cancan;

    allow(User, ['read', 'create', 'destroy'], Product);

    const user = new User();
    const product = new Product();

    t.true(await can(user, 'read', product));
    t.true(await can(user, 'create', product));
    t.true(await can(user, 'destroy', product));
});

test('allow all actions using "manage"', async (t) => {
    const cancan = new CanCan();
    const {can, allow} = cancan;

    allow(User, 'manage', Product);

    const user = new User();
    const product = new Product();

    t.true(await can(user, 'read', product));
    t.true(await can(user, 'create', product));
    t.true(await can(user, 'update', product));
    t.true(await can(user, 'destroy', product));
    t.true(await can(user, 'modify', product));
});

test('allow all actions and all objects', async (t) => {
    const cancan = new CanCan();
    const {can, allow} = cancan;

    allow(User, 'manage', 'all');

    const user = new User();
    const product = new Product();

    t.true(await can(user, 'read', user));
    t.true(await can(user, 'read', product));
});

test('allow only objects that satisfy given condition', async (t) => {
    const cancan = new CanCan();
    const {can, allow} = cancan;

    allow(User, 'read', Product, {published: true});

    const user = new User();
    const privateProduct = new Product();
    const publicProduct = new Product({published: true});

    t.false(await can(user, 'read', privateProduct));
    t.true(await can(user, 'read', publicProduct));
});

test('allow only when performer passes a condition', async (t) => {
    const cancan = new CanCan();
    const {can, allow} = cancan;

    allow(User, 'read', Product, user => user.get('admin'));

    const user = new User();
    const adminUser = new User({admin: true});
    const product = new Product();

    t.false(await can(user, 'read', product));
    t.true(await can(adminUser, 'read', product));
});

test('allow only when target passes a condition', async (t) => {
    const cancan = new CanCan();
    const {can, allow} = cancan;

    allow(User, 'read', Product, (user, product) => product.get('published'));

    const user = new User();
    const privateProduct = new Product();
    const publicProduct = new Product({published: true});

    t.false(await can(user, 'read', privateProduct));
    t.true(await can(user, 'read', publicProduct));
});

test('throw when condition is not a function or an object', t => {
    const cancan = new CanCan();
    const {allow} = cancan;

    t.notThrows(() => allow(User, 'read', Product, undefined));
    t.throws(() => allow(User, 'read', Product, 'abc'), 'Expected condition to be object or function, got string');
});

test('allow permissions on classes', async (t) => {
    const cancan = new CanCan();
    const {can, allow} = cancan;

    allow(User, 'read', Product);

    const user = new User();

    t.true(await can(user, 'read', Product));
});

test('throw if permission is not granted', async (t) => {
    const cancan = new CanCan();
    const {allow, authorize} = cancan;

    allow(User, 'read', Product, (user, product) => product.get('published'));

    const user = new User();
    const privateProduct = new Product();
    const publicProduct = new Product({published: true});

    await t.throwsAsync(() => authorize(user, 'read', privateProduct), 'Authorization error');
});

test('throw a custom error if permission is not granted', async (t) => {
    class AuthError extends Error {
        constructor(message) {
            super(message);
            this.message = message;
        }
    }

    const cancan = new CanCan({
        createError(performer, action, target) {
            return new AuthError(`User couldn't ${action} product`);
        }
    });

    const {allow, authorize} = cancan;

    allow(User, 'read', Product, (user, product) => product.get('published'));

    const user = new User();
    const privateProduct = new Product();
    const publicProduct = new Product({published: true});

    authorize(user, 'read', publicProduct);

    await t.throwsAsync(() => authorize(user, 'read', privateProduct), AuthError, 'User couldn\'t read product');
});

test('override instanceOf', async (t) => {
    const cancan = new CanCan({
        instanceOf(instance, model) {
            return instance instanceof model.Instance;
        }
    });

    const {allow, can, cannot} = cancan;

    // Mimic Sequelize models
    allow({Instance: User}, 'read', {Instance: Product});

    const user = new User();
    const product = new Product();

    t.true(await can(user, 'read', product));
    t.false(await cannot(user, 'read', product));
    t.false(await can(user, 'create', product));
});

test('pass options to the rule', async (t) => {
    const cancan = new CanCan();
    const {can, allow} = cancan;

    const admin = new User({role: 'administrator'});
    const user = new User({role: 'user'});

    allow(User, 'update', User, (user, target, options) => {
        if (user.get('role') === 'administrator') {
            return true;
        }

        // Don't let regular user update their role
        if (user.get('role') === 'user' && options.fields.indexOf('role') >= 0) {
            return false;
        }

        return true;
    });

    t.true(await can(admin, 'update', user, {fields: ['role']}));
    t.true(await can(user, 'update', user, {fields: ['username']}));
    t.false(await can(user, 'update', user, {fields: ['role']}));
});

test('passed function should be async/awaitable', async (t) => {
    const cancan = new CanCan();
    const {can, allow} = cancan;

    const admin = new User({role: 'administrator'});
    const user = new User({role: 'user'});

    allow(User, 'update', User, async (user, target, options) => {
        await delay(30);
        return false;
    });

    t.false(await can(user, 'update', user, {fields: ['role']}));
});
