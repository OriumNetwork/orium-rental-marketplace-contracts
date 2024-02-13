import { toWei } from '../../../utils/bignumber'
import { defaultAbiCoder as abi } from 'ethers/lib/utils'
import { USER_ROLE } from '../../../utils/roles'
import { inputsToTypes } from '../../../utils/role-metadata'

export const role1 = '0x3d926b0dd5f4880fb18c9a49c890c7d76c2a97e0d4b4c20f1bb3fe6e5f89f5f4'
export const roleMetadata1 = {
  inputs: [
    {
      name: 'a',
      type: 'uint256',
    },
    {
      name: 'b',
      type: 'uint256[]',
    },
    {
      name: 'role',
      type: 'bytes32',
    },
    {
      name: 'customData',
      type: 'bytes',
    },
    {
      name: 'c',
      type: 'tuple',
      components: [
        {
          name: 'd',
          type: 'uint256',
        },
        {
          name: 'e',
          type: 'uint256[]',
        },
        {
          name: 'f',
          type: 'tuple[]',
          components: [
            {
              name: 'g',
              type: 'bool',
            },
            {
              name: 'h',
              type: 'address',
            },
          ],
        },
      ],
    },
  ],
}

export const data1 = {
  a: toWei('1').toString(),
  b: [toWei('2').toString(), toWei('3').toString()],
  role: USER_ROLE,
  customData: abi.encode(['uint256'], [123]),
  c: {
    d: toWei('4').toString(),
    e: [toWei('5').toString(), toWei('6').toString()],
    f: [
      {
        g: true,
        h: '0xe3A75c99cD21674188bea652Fe378cA5cf7e7906',
      },
      {
        g: false,
        h: '0xe3A75c99cD21674188bea652Fe378cA5cf7e7906',
      },
    ],
  },
}

const rolesDataTypes1 = inputsToTypes(roleMetadata1.inputs)
export const role1Data = abi.encode(rolesDataTypes1, Object.values(data1))

export const data2 = {
  Channeling: true,
  ThirdPartyAddress: '0xe3A75c99cD21674188bea652Fe378cA5cf7e7906',
  ProfitShare: {
    Lender: toWei('60'),
    Borrower: toWei('30'),
    ThirdParty: toWei('10'),
  },
}

export const role2 = '0x3d926b0dd5f4880fb18c9a49c890c7d76c2a97e0d4b4c20f1bb3fe6e5f89f0f4'
export const roleMetadata2 = {
  inputs: [
    {
      name: 'Channeling',
      type: 'bool',
    },
    {
      name: 'ThirdPartyAddress',
      type: 'address',
    },
    {
      name: 'ProfitShare',
      type: 'tuple',
      validation: 'profit-share',
      components: [
        {
          name: 'Lender',
          type: 'uint256',
        },
        {
          name: 'Borrower',
          type: 'uint256',
        },
        {
          name: 'ThirdParty',
          type: 'uint256',
        },
      ],
    },
  ],
}

const rolesDataTypes2 = inputsToTypes(roleMetadata2.inputs)
export const role2Data = abi.encode(rolesDataTypes2, Object.values(data2))
