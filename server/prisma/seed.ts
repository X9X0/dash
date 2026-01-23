import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Create machine types
  const machineTypes = [
    {
      name: 'FDM Printer',
      category: 'printer',
      icon: 'printer',
      fieldsSchema: JSON.stringify({
        buildVolume: { type: 'string', label: 'Build Volume (mm)' },
        nozzleSize: { type: 'number', label: 'Nozzle Size (mm)' },
        heatedBed: { type: 'boolean', label: 'Heated Bed' },
        materials: { type: 'select', label: 'Materials', options: ['PLA', 'ABS', 'PETG', 'TPU', 'Nylon'] },
      }),
    },
    {
      name: 'SLA/Resin Printer',
      category: 'printer',
      icon: 'printer',
      fieldsSchema: JSON.stringify({
        buildVolume: { type: 'string', label: 'Build Volume (mm)' },
        layerResolution: { type: 'number', label: 'Layer Resolution (microns)' },
        resinType: { type: 'select', label: 'Resin Type', options: ['Standard', 'Tough', 'Flexible', 'Castable'] },
      }),
    },
    {
      name: 'SLS Printer',
      category: 'printer',
      icon: 'printer',
      fieldsSchema: JSON.stringify({
        buildVolume: { type: 'string', label: 'Build Volume (mm)' },
        material: { type: 'select', label: 'Material', options: ['Nylon', 'TPU', 'Polypropylene'] },
        laserPower: { type: 'number', label: 'Laser Power (W)' },
      }),
    },
    {
      name: 'Biped Humanoid',
      category: 'robot',
      icon: 'bot',
      fieldsSchema: JSON.stringify({
        height: { type: 'number', label: 'Height (cm)' },
        dof: { type: 'number', label: 'Degrees of Freedom' },
        sensors: { type: 'string', label: 'Sensors' },
        batteryCapacity: { type: 'number', label: 'Battery Capacity (Wh)' },
      }),
    },
    {
      name: 'Robot Arm',
      category: 'robot',
      icon: 'bot',
      fieldsSchema: JSON.stringify({
        reach: { type: 'number', label: 'Reach (mm)' },
        payload: { type: 'number', label: 'Payload (kg)' },
        dof: { type: 'number', label: 'Degrees of Freedom' },
        endEffector: { type: 'select', label: 'End Effector', options: ['Gripper', 'Suction', 'Tool Changer', 'Welding Torch'] },
      }),
    },
    {
      name: 'Wheeled Humanoid',
      category: 'robot',
      icon: 'bot',
      fieldsSchema: JSON.stringify({
        driveType: { type: 'select', label: 'Drive Type', options: ['Differential', 'Omnidirectional', 'Mecanum', 'Tracked'] },
        payload: { type: 'number', label: 'Payload (kg)' },
        batteryCapacity: { type: 'number', label: 'Battery Capacity (Wh)' },
        sensors: { type: 'string', label: 'Sensors' },
      }),
    },
    {
      name: 'Testbench',
      category: 'robot',
      icon: 'flask',
      fieldsSchema: JSON.stringify({
        testType: { type: 'select', label: 'Test Type', options: ['Electronics', 'Mechanical', 'Software', 'Integration'] },
        maxLoad: { type: 'number', label: 'Max Load (kg)' },
        sensors: { type: 'string', label: 'Sensors' },
        dataPorts: { type: 'number', label: 'Data Ports' },
      }),
    },
  ]

  for (const type of machineTypes) {
    await prisma.machineType.upsert({
      where: { id: type.name.toLowerCase().replace(/[^a-z0-9]/g, '-') },
      update: type,
      create: {
        id: type.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        ...type,
      },
    })
  }

  console.log(`Created ${machineTypes.length} machine types`)

  // Check if admin user exists
  const adminExists = await prisma.user.findFirst({
    where: { role: 'admin' },
  })

  if (!adminExists) {
    // Create default admin user
    const passwordHash = await bcrypt.hash('admin123', 10)
    await prisma.user.create({
      data: {
        email: 'admin@example.com',
        passwordHash,
        name: 'Admin',
        role: 'admin',
      },
    })
    console.log('Created default admin user (admin@example.com / admin123)')
  }

  // Create sample machines if none exist
  const machineCount = await prisma.machine.count()
  if (machineCount === 0) {
    const fdmType = await prisma.machineType.findFirst({ where: { name: 'FDM Printer' } })
    const armType = await prisma.machineType.findFirst({ where: { name: 'Robot Arm' } })

    if (fdmType) {
      await prisma.machine.create({
        data: {
          name: 'Prusa MK4 #1',
          typeId: fdmType.id,
          model: 'Prusa MK4',
          location: 'Lab A - Station 1',
          status: 'available',
          hourMeter: 156.5,
          notes: 'Recently calibrated',
        },
      })

      await prisma.machine.create({
        data: {
          name: 'Bambu X1C #1',
          typeId: fdmType.id,
          model: 'Bambu Lab X1 Carbon',
          location: 'Lab A - Station 2',
          status: 'available',
          hourMeter: 89.2,
        },
      })
    }

    if (armType) {
      await prisma.machine.create({
        data: {
          name: 'UR5e Arm',
          typeId: armType.id,
          model: 'Universal Robots UR5e',
          location: 'Lab B - Cell 1',
          status: 'available',
          hourMeter: 423.0,
          notes: 'Collaborative robot arm',
        },
      })
    }

    console.log('Created sample machines')
  }

  console.log('Seed completed!')
}

main()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
