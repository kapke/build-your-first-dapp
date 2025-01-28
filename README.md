
# Build your first DApp

1. Get Compact compiler and make it available on $PATH
2. Setup node.js (preferably with nvm - https://github.com/nvm-sh/nvm)
3. Install dependencies `npm install`
4. Install turbo - `npm install -g turbo` for easy CLI access
5. Verify installation - `turbo check` - `1-simple-counter` should pass, others should fail in various stages

## Tasks

1. Study `1-simple-counter` code for overall strucutre
2. Implement contract in `2-only-permitted` to allow only specific parties increase the counter
   * \* Implement functionality allowing admin user to add more parties allowed
   * \** Implement functionality allowing admin to add more admins
3. Implement contract in `3-only-once` to allow participants to increase the counter only once per contract lifecycle
   * \* Do it on top of the #2
   * \** Do it without revealing linkage between parties increasing counter and being allowed
4. Implement contract in `4-with-tokens`, which requires participants to buy a native token, and then spend it to increase the counter.
